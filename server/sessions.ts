import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { WebSocket } from "ws";
import { gitEnv, sessionEnv, trustWorkspace, type GrottoConfig } from "./config.js";
import { assertOk, runGit } from "./git.js";
import { HttpError } from "./http.js";
import { spawnPty, type PtyHandle } from "./pty.js";

/** Retained PTY output replayed on (re)connect — phones drop sockets constantly. */
const SCROLLBACK_MAX = 200_000;

export type SetupState = "none" | "running" | "done" | "failed";

export interface SessionInfo {
  id: string;
  repo: string;
  branch: string | null;
  createdAt: number;
  ptyLive: boolean;
  setup: SetupState;
  /** True when the tail of the PTY output looks like a Claude Code permission
   *  prompt awaiting an answer — the "needs you" triage signal. */
  needsYou: boolean;
  /** What the agent is asking to do, when detectable (e.g. "Bash(git push)"). */
  approval: string | null;
  /** Last non-empty terminal line, ANSI-stripped, for control-room cards. */
  lastLine: string | null;
  lastOutputAt: number | null;
  /** Claude model last reported by the statusline wrapper for this workspace. */
  model: string | null;
}

/** Read the model recorded by scripts/grotto-statusline.sh for a session. */
function readModel(claudeConfigDir: string, sessionId: string): string | null {
  try {
    const file = path.join(claudeConfigDir, `.grotto-model.${sessionId}`);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    const value = fs.readFileSync(file, "utf8").trim();
    return /^[\w .()[\]-]{1,60}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

/* eslint-disable no-control-regex */
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|[\x00-\x08\x0b-\x1f\x7f]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/**
 * Heuristic per the design handoff (Open question #1, option a): Claude Code's
 * permission dialog renders numbered options ("1. Yes" … "2./3. …"). If that
 * pattern sits at the tail of the scrollback, the agent is blocked on us.
 * The terminal remains the source of truth — this only powers triage UI.
 */
export function detectApproval(tail: string): { needsYou: boolean; approval: string | null } {
  const text = stripAnsi(tail);
  const window = text.slice(-1500);
  const hasOptions = /\b1\.\s*Yes\b[\s\S]{0,400}\b(?:2|3)\.\s*(?:Yes|No)/.test(window);
  if (!hasOptions) return { needsYou: false, approval: null };
  const tool = window.match(/([A-Z]\w+\([^)\n]{1,100}\))/g);
  const ask = window.match(/Do you want to ([^\n?]{5,80})\??/);
  return {
    needsYou: true,
    approval: tool ? tool[tool.length - 1] : ask ? ask[1].trim() : null,
  };
}

function lastNonEmptyLine(tail: string): string | null {
  const lines = stripAnsi(tail).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    // Skip box-drawing chrome and prompt-looking lines (end in #, $, ❯, >).
    if (/^[│╭╰─┃>❯$#\s]*$/.test(line)) continue;
    if (/[#$%>❯]\s*$/.test(line)) continue;
    return line.slice(0, 90);
  }
  return null;
}

type TermMsg =
  | { t: "hello"; backend: string }
  | { t: "out"; d: string }
  | { t: "exit"; code: number };

export class Session {
  pty: PtyHandle | null = null;
  setup: SetupState = "none";
  private scrollback = "";
  private lastOutputAt: number | null = null;
  private sockets = new Set<WebSocket>();

  constructor(
    readonly id: string,
    readonly repo: string,
    readonly branch: string | null,
    readonly dir: string,
    private cfg: GrottoConfig,
    readonly createdAt = Date.now(),
  ) {}

  info(): SessionInfo {
    const tail = this.scrollback.slice(-4000);
    const { needsYou, approval } = this.pty
      ? detectApproval(tail)
      : { needsYou: false, approval: null };
    return {
      id: this.id,
      repo: this.repo,
      branch: this.branch,
      createdAt: this.createdAt,
      ptyLive: this.pty !== null,
      setup: this.setup,
      needsYou,
      approval,
      lastLine: lastNonEmptyLine(tail),
      lastOutputAt: this.lastOutputAt,
      model: readModel(this.cfg.claudeConfigDir, this.id),
    };
  }

  private broadcast(msg: TermMsg): void {
    if (msg.t === "out") {
      this.scrollback = (this.scrollback + msg.d).slice(-SCROLLBACK_MAX);
      this.lastOutputAt = Date.now();
    }
    const payload = JSON.stringify(msg);
    for (const ws of this.sockets) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  /**
   * The PTY outlives any single WebSocket: lock your phone mid-`claude` run,
   * reconnect, and the session (plus scrollback) is still there.
   */
  private async ensurePty(): Promise<PtyHandle> {
    if (this.pty) return this.pty;
    const pty = await spawnPty({
      cwd: this.dir,
      env: sessionEnv(this.cfg),
      cols: 100,
      rows: 30,
    });
    pty.onData((d) => this.broadcast({ t: "out", d }));
    pty.onExit((code) => {
      this.pty = null;
      this.broadcast({ t: "exit", code });
    });
    this.pty = pty;
    return pty;
  }

  async attach(ws: WebSocket): Promise<void> {
    const pty = await this.ensurePty();
    this.sockets.add(ws);
    ws.send(JSON.stringify({ t: "hello", backend: pty.backend } satisfies TermMsg));
    if (this.scrollback) {
      ws.send(JSON.stringify({ t: "out", d: this.scrollback } satisfies TermMsg));
    }
    ws.on("message", (raw) => {
      let msg: { t?: string; d?: string; cols?: number; rows?: number };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === "in" && typeof msg.d === "string") {
        this.pty?.write(msg.d);
      } else if (
        msg.t === "resize" &&
        typeof msg.cols === "number" &&
        typeof msg.rows === "number" &&
        msg.cols > 0 &&
        msg.rows > 0
      ) {
        this.pty?.resize(Math.min(msg.cols, 500), Math.min(msg.rows, 200));
      }
    });
    ws.on("close", () => this.sockets.delete(ws));
  }

  runSetup(command: string): void {
    this.setup = "running";
    this.broadcast({ t: "out", d: `\r\n[grotto] setup: ${command}\r\n` });
    const child = spawn("bash", ["-lc", command], {
      cwd: this.dir,
      env: sessionEnv(this.cfg),
    });
    const forward = (d: Buffer) =>
      this.broadcast({ t: "out", d: d.toString("utf8").replace(/\n/g, "\r\n") });
    child.stdout.on("data", forward);
    child.stderr.on("data", forward);
    child.on("close", (code) => {
      this.setup = code === 0 ? "done" : "failed";
      this.broadcast({ t: "out", d: `\r\n[grotto] setup ${this.setup}\r\n` });
    });
    child.on("error", () => {
      this.setup = "failed";
    });
  }

  destroy(): void {
    this.pty?.kill();
    for (const ws of this.sockets) ws.close();
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

interface RegistryEntry {
  id: string;
  repo: string;
  branch: string | null;
  dir: string;
  createdAt: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private registryPath: string;

  constructor(private cfg: GrottoConfig) {
    this.registryPath = path.join(cfg.home, "sessions.json");
    this.restore();
  }

  /**
   * With GROTTO_HOME on a persistent volume, workspaces outlive server
   * restarts and redeploys. The registry lets us re-adopt them: the PTY and
   * scrollback are gone, but the checkout, branch, and uncommitted work are
   * intact — a fresh shell spawns in place on the next terminal connect.
   */
  private restore(): void {
    let entries: RegistryEntry[];
    try {
      entries = JSON.parse(fs.readFileSync(this.registryPath, "utf8")) as RegistryEntry[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e?.id || !e.dir || !fs.existsSync(e.dir)) continue;
      this.sessions.set(e.id, new Session(e.id, e.repo, e.branch, e.dir, this.cfg, e.createdAt));
      trustWorkspace(this.cfg, e.dir);
    }
    this.save(); // prune entries whose workspace vanished
  }

  private save(): void {
    const entries: RegistryEntry[] = [...this.sessions.values()].map((s) => ({
      id: s.id,
      repo: s.repo,
      branch: s.branch,
      dir: s.dir,
      createdAt: s.createdAt,
    }));
    try {
      const tmp = this.registryPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
      fs.renameSync(tmp, this.registryPath);
    } catch {
      /* registry is best-effort — never block session ops on it */
    }
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => s.info());
  }

  get(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new HttpError(404, `no such session: ${id}`);
    return s;
  }

  async create(repo: string, branch: string | null): Promise<Session> {
    if (!REPO_RE.test(repo)) throw new HttpError(400, "repo must be owner/name");
    if (branch && !/^[\w./-]+$/.test(branch)) throw new HttpError(400, "bad branch name");

    const id = crypto.randomBytes(4).toString("hex");
    const dir = path.join(this.cfg.home, "sessions", id);
    const env = gitEnv(this.cfg);
    // Username-only in the URL; the password comes from GIT_ASKPASS so the
    // token never lands in .git/config.
    const url = this.cfg.gitToken
      ? `https://x-access-token@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
    assertOk(await runGit(this.cfg.home, ["clone", url, dir], env, 600_000), "clone");
    if (branch) {
      const existing = await runGit(dir, ["checkout", branch], env);
      if (existing.code !== 0) {
        assertOk(await runGit(dir, ["checkout", "-b", branch], env), "checkout -b");
      }
    }

    const session = new Session(id, repo, branch, dir, this.cfg);
    this.sessions.set(id, session);
    this.save();
    // Terminal claude in this fresh workspace must not open with a full-screen
    // trust dialog — pre-accept it (headless SDK sessions never show one).
    trustWorkspace(this.cfg, dir);
    if (this.cfg.sessionSetup) session.runSetup(this.cfg.sessionSetup);
    return session;
  }

  destroy(id: string): void {
    this.get(id).destroy();
    this.sessions.delete(id);
    this.save();
  }
}
