import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { WebSocket } from "ws";
import { gitEnv, sessionEnv, trustWorkspaces, type GrottoConfig } from "./config.js";
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
  /** Every checkout in the session; `repos[0]` is the primary (and mirrors the
   *  `repo`/`branch` fields above, which stay for v1 clients). */
  repos: RepoRef[];
}

/** A session's checkout as seen by clients — no server paths. */
export interface RepoRef {
  repo: string;
  branch: string | null;
  name: string;
  status: "cloning" | "ready" | "failed";
  error?: string;
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
  /** In-flight spawn, so concurrent attaches share one shell (see ensurePty). */
  private spawning: Promise<PtyHandle> | null = null;
  setup: SetupState = "none";
  private scrollback = "";
  private lastOutputAt: number | null = null;
  private sockets = new Set<WebSocket>();

  readonly repos: RepoSlot[];

  constructor(
    readonly id: string,
    repos: RepoSlot[],
    private cfg: GrottoConfig,
    readonly createdAt = Date.now(),
  ) {
    if (!repos.length) throw new Error("session needs at least one repo");
    this.repos = repos;
  }

  /** The primary checkout — the agent's cwd, and what every v1 caller means. */
  get primary(): RepoSlot {
    return this.repos[0];
  }
  get repo(): string {
    return this.primary.repo;
  }
  get branch(): string | null {
    return this.primary.branch;
  }
  get dir(): string {
    return this.primary.dir;
  }
  /** Extra checkouts handed to the SDK as additionalDirectories. */
  get extraDirs(): string[] {
    return this.repos.slice(1).filter((r) => r.status === "ready").map((r) => r.dir);
  }
  /** Resolve a ?repo= name to a slot; null/absent means the primary. */
  slot(name: string | null): RepoSlot {
    if (!name) return this.primary;
    const found = this.repos.find((r) => r.name === name);
    if (!found) throw new HttpError(404, `no such repo in session: ${name}`);
    return found;
  }
  addSlot(slot: RepoSlot): void {
    this.repos.push(slot);
  }
  removeSlot(name: string): RepoSlot {
    const i = this.repos.findIndex((r) => r.name === name);
    if (i < 0) throw new HttpError(404, `no such repo in session: ${name}`);
    if (i === 0) throw new HttpError(400, "cannot remove the primary repository");
    return this.repos.splice(i, 1)[0];
  }

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
      repos: this.repos.map((r) => ({
        repo: r.repo, branch: r.branch, name: r.name, status: r.status, ...(r.error ? { error: r.error } : {}),
      })),
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
    // `this.pty` is only assigned AFTER the await, so two sockets attaching in
    // the same tick would both pass the guard and spawn a shell — the first
    // becoming an orphan that still feeds broadcast(). Latch the in-flight
    // promise so concurrent callers share one spawn.
    this.spawning ??= (async () => {
      const pty = await spawnPty({
        cwd: this.dir,
        env: sessionEnv(this.cfg),
        cols: 100,
        rows: 30,
      });
      pty.onData((d) => this.broadcast({ t: "out", d }));
      pty.onExit((code) => {
        if (this.pty === pty) this.pty = null;
        this.broadcast({ t: "exit", code });
      });
      this.pty = pty;
      return pty;
    })().finally(() => {
      this.spawning = null;
    });
    return this.spawning;
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
    for (const r of this.repos) fs.rmSync(r.dir, { recursive: true, force: true });
  }
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/** Short label for a checkout: the repo's name segment, filesystem-safe.
 *  Used in the workspace directory name, in `?repo=` and in the UI. */
export function slotName(repo: string): string {
  const tail = repo.split("/").pop() ?? repo;
  const safe = tail.replace(/[^\w.-]/g, "-").replace(/^[.-]+/, "").slice(0, 40);
  return safe || "repo";
}

/** slotName, disambiguated against names already taken in this session.
 *  Two repos can share a name segment (acme/api and beta/api) — the second
 *  becomes "api-2". Mutates `used`. */
export function uniqueName(repo: string, used: Set<string>): string {
  const base = slotName(repo);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  used.add(name);
  return name;
}

/** One checkout inside a session. A session's FIRST slot is the primary: its
 *  dir is the agent's cwd; the rest are passed as additionalDirectories. */
export interface RepoSlot {
  repo: string;
  branch: string | null;
  dir: string;
  /** Short unique label used in URLs and the UI (usually the repo name). */
  name: string;
  status: "cloning" | "ready" | "failed";
  error?: string;
}

interface RegistryEntry {
  id: string;
  /** v2. Older registries carry only the v1 fields below. */
  repos?: RepoSlot[];
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
    const base = path.join(this.cfg.home, "sessions") + path.sep;
    for (const e of entries) {
      if (!e?.id) continue;
      // v2 registries carry `repos`; v1 carries only {repo,branch,dir}. Read both.
      const raw: RepoSlot[] = Array.isArray(e.repos) && e.repos.length
        ? e.repos
        : e.dir
          ? [{ repo: e.repo, branch: e.branch, dir: e.dir, name: slotName(e.repo), status: "ready" }]
          : [];
      // Containment: never adopt a dir outside the sessions root (a tampered
      // registry must not point the agent at an arbitrary path).
      const live = raw.filter((r) => r.dir.startsWith(base) && fs.existsSync(r.dir));
      // A missing PRIMARY drops the session; a missing EXTRA just prunes that slot.
      if (!live.length || live[0].dir !== raw[0]?.dir) continue;
      this.sessions.set(e.id, new Session(e.id, live, this.cfg, e.createdAt));
      trustWorkspaces(this.cfg, live.map((r) => r.dir));
    }
    this.save(); // prune entries whose workspace vanished
  }

  private save(): void {
    // Dual-write: v2 `repos` plus the v1 mirror, so an older build can still
    // read the registry (and so a rollback doesn't orphan every workspace).
    const entries: RegistryEntry[] = [...this.sessions.values()].map((s) => ({
      id: s.id,
      repos: s.repos,
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

  /** Clone one repo into `dir`. Cleans up a partial checkout on failure. */
  private async cloneInto(repo: string, branch: string | null, dir: string): Promise<void> {
    const env = gitEnv(this.cfg);
    // Username-only in the URL; the password comes from GIT_ASKPASS so the
    // token never lands in .git/config.
    const url = this.cfg.gitToken
      ? `https://x-access-token@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
    try {
      assertOk(await runGit(this.cfg.home, ["clone", url, dir], env, 600_000), "clone");
      if (branch) {
        const existing = await runGit(dir, ["checkout", branch], env);
        if (existing.code !== 0) {
          assertOk(await runGit(dir, ["checkout", "-b", branch], env), "checkout -b");
        }
      }
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }

  private validate(repo: string, branch: string | null): void {
    if (!REPO_RE.test(repo)) throw new HttpError(400, "repo must be owner/name");
    if (branch && !/^[\w./-]+$/.test(branch)) throw new HttpError(400, "bad branch name");
  }

  /** Create a session from one or more repos. The FIRST becomes the primary
   *  (the agent's cwd); the rest are additional directories. A failing extra
   *  clone is recorded as a failed slot rather than sinking the session. */
  async create(specs: Array<{ repo: string; branch: string | null }>): Promise<Session> {
    if (!specs.length) throw new HttpError(400, "at least one repo is required");
    for (const sp of specs) this.validate(sp.repo, sp.branch);

    const id = crypto.randomBytes(4).toString("hex");
    const slots: RepoSlot[] = [];
    const used = new Set<string>();
    for (const [i, sp] of specs.entries()) {
      const name = uniqueName(sp.repo, used);
      // Siblings, never nested: a checkout inside another would show up in the
      // parent's `git status`, tree listing and `git add -A`.
      const dir = path.join(this.cfg.home, "sessions", `${id}__${name}`);
      try {
        await this.cloneInto(sp.repo, sp.branch, dir);
        slots.push({ repo: sp.repo, branch: sp.branch, dir, name, status: "ready" });
      } catch (e) {
        // The primary must succeed — without it there is no session at all.
        if (i === 0) throw e;
        slots.push({
          repo: sp.repo, branch: sp.branch, dir, name, status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const session = new Session(id, slots, this.cfg);
    this.sessions.set(id, session);
    this.save();
    // Terminal claude in these fresh workspaces must not open with a full-screen
    // trust dialog — pre-accept them (headless SDK sessions never show one).
    trustWorkspaces(this.cfg, slots.filter((r) => r.status === "ready").map((r) => r.dir));
    if (this.cfg.sessionSetup) session.runSetup(this.cfg.sessionSetup);
    return session;
  }

  /** Add a repo to a live session. */
  async addRepo(id: string, repo: string, branch: string | null): Promise<Session> {
    const session = this.get(id);
    this.validate(repo, branch);
    const used = new Set(session.repos.map((r) => r.name));
    const name = uniqueName(repo, used);
    const dir = path.join(this.cfg.home, "sessions", `${id}__${name}`);
    await this.cloneInto(repo, branch, dir);
    session.addSlot({ repo, branch, dir, name, status: "ready" });
    this.save();
    trustWorkspaces(this.cfg, [dir]);
    return session;
  }

  /** Remove a non-primary repo and delete its checkout. */
  removeRepo(id: string, name: string): Session {
    const session = this.get(id);
    const slot = session.removeSlot(name);
    try {
      fs.rmSync(slot.dir, { recursive: true, force: true });
    } catch {
      /* the slot is gone from the model either way */
    }
    this.save();
    return session;
  }

  destroy(id: string): void {
    this.get(id).destroy();
    this.sessions.delete(id);
    this.save();
  }
}
