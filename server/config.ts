import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface GrottoConfig {
  /** State directory for sessions, tokens, askpass helper. */
  home: string;
  port: number;
  /** Bearer token required on every /api call and WS upgrade. */
  token: string;
  /** Where `token` came from — "env" (GROTTO_TOKEN set) or "generated" (random,
   *  written to the volume; the operator can't know it → login always 401s). */
  tokenSource: "env" | "generated";
  /** GitHub token used for clone/push. Never written into remote URLs. */
  gitToken: string | null;
  /** Repos offered in the picker, as "owner/repo". */
  repos: string[];
  /** Optional shell command run in a fresh workspace after clone (e.g. caveman install). */
  sessionSetup: string | null;
  /** Where caveman's flag files live — mirrors the hooks' resolution order. */
  claudeConfigDir: string;
}

interface FileConfig {
  repos?: string[];
  sessionSetup?: string;
  port?: number;
}

function readFileConfig(home: string): FileConfig {
  try {
    const raw = fs.readFileSync(path.join(home, "config.json"), "utf8");
    return JSON.parse(raw) as FileConfig;
  } catch {
    return {};
  }
}

/**
 * Token resolution: GROTTO_TOKEN env wins; otherwise a token is generated once
 * and persisted to $GROTTO_HOME/token so restarts don't log everyone out.
 */
function resolveToken(home: string): { token: string; source: "env" | "generated" } {
  const fromEnv = process.env.GROTTO_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: "env" };
  const tokenPath = path.join(home, "token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return { token: existing, source: "generated" };
  } catch {
    /* fall through to generate */
  }
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(tokenPath, token + "\n", { mode: 0o600 });
  return { token, source: "generated" };
}

export function loadConfig(): GrottoConfig {
  const home = process.env.GROTTO_HOME ?? path.join(os.homedir(), ".grotto");
  fs.mkdirSync(path.join(home, "sessions"), { recursive: true });
  const file = readFileConfig(home);

  const envRepos = (process.env.GROTTO_REPOS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const repos = [...new Set([...envRepos, ...(file.repos ?? [])])];

  const { token, source } = resolveToken(home);
  return {
    home,
    port: Number(process.env.PORT ?? file.port ?? 4870),
    token,
    tokenSource: source,
    gitToken: process.env.GROTTO_GIT_TOKEN?.trim() || null,
    repos,
    sessionSetup: process.env.GROTTO_SESSION_SETUP ?? file.sessionSetup ?? null,
    claudeConfigDir:
      process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
  };
}

/**
 * Git auth without persisting secrets: an askpass helper that echoes the token
 * from the environment. The token never lands in .git/config or remote URLs.
 */
export function ensureAskpass(cfg: GrottoConfig): string | null {
  if (!cfg.gitToken) return null;
  const askpass = path.join(cfg.home, "askpass.sh");
  fs.writeFileSync(askpass, '#!/bin/sh\necho "$GROTTO_GIT_TOKEN"\n', {
    mode: 0o700,
  });
  return askpass;
}

/** Environment for every git invocation and every PTY, so terminal git works too. */
export function gitEnv(cfg: GrottoConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const askpass = ensureAskpass(cfg);
  if (askpass && cfg.gitToken) {
    env.GIT_ASKPASS = askpass;
    env.GIT_TERMINAL_PROMPT = "0";
    env.GROTTO_GIT_TOKEN = cfg.gitToken;
  }
  return env;
}

// ── Claude subscription token ───────────────────────────────────────────────
// A long-lived OAuth token minted by `claude setup-token`, stored on the
// volume and injected as CLAUDE_CODE_OAUTH_TOKEN into every session process.
// Makes agent auth independent of container lifetime and of the interactive
// login's refresh cycle; re-provisioning is a single paste in the UI.

function claudeTokenPath(cfg: GrottoConfig): string {
  return path.join(cfg.home, "claude-token");
}

export function readClaudeToken(cfg: GrottoConfig): string | null {
  try {
    const value = fs.readFileSync(claudeTokenPath(cfg), "utf8").trim();
    return /^[\x21-\x7e]{20,512}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeClaudeToken(cfg: GrottoConfig, token: string): void {
  fs.writeFileSync(claudeTokenPath(cfg), token + "\n", { mode: 0o600 });
}

export function clearClaudeToken(cfg: GrottoConfig): void {
  fs.rmSync(claudeTokenPath(cfg), { force: true });
}

/** Classify a stored Claude credential so we inject it under the RIGHT env var.
 *  A setup-token (`sk-ant-oat…`) is an OAuth bearer; an API key (`sk-ant-api…`)
 *  is NOT a bearer and 401s ("Invalid bearer token") if sent as one. */
export function claudeTokenKind(token: string): "oauth" | "apikey" | "other" {
  if (/^sk-ant-oat/i.test(token)) return "oauth";
  if (/^sk-ant-api/i.test(token)) return "apikey";
  return "other";
}

/** Redacted view of the stored Claude credential for diagnostics (never full). */
export function claudeTokenInfo(cfg: GrottoConfig): {
  present: boolean;
  kind: "oauth" | "apikey" | "other" | null;
  preview: string | null;
} {
  const t = readClaudeToken(cfg);
  if (!t) return { present: false, kind: null, preview: null };
  return { present: true, kind: claudeTokenKind(t), preview: `${t.slice(0, 14)}…(${t.length} chars)` };
}

/** Full environment for session processes (PTY, setup): git auth + agent auth. */
export function sessionEnv(cfg: GrottoConfig): NodeJS.ProcessEnv {
  const env = gitEnv(cfg);
  const token = readClaudeToken(cfg);
  if (token) {
    // Route by token type. Whichever we set, clear the others so a stray host
    // ANTHROPIC_API_KEY can't shadow (or an OAuth token can't be sent as a key).
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    if (claudeTokenKind(token) === "apikey") env.ANTHROPIC_API_KEY = token;
    else env.CLAUDE_CODE_OAUTH_TOKEN = token; // oauth (or unknown → try as bearer)
  }
  return env;
}

// ── Claude first-run state ──────────────────────────────────────────────────
// On a FRESH config dir, any interactive claude invocation front-loads the
// onboarding TUI (theme picker) and every new workspace triggers the trust
// dialog — full-screen prompts that are hostile on a phone, and that made the
// hidden setup-token PTY hang waiting for input. Pre-seeding the state file
// claude itself writes makes both disappear. Headless (SDK) sessions never
// show them, but the terminal claude still benefits.

/** claude stores this at $CLAUDE_CONFIG_DIR/.claude.json (or ~/.claude.json). */
function claudeStatePath(cfg: GrottoConfig): string {
  return process.env.CLAUDE_CONFIG_DIR
    ? path.join(cfg.claudeConfigDir, ".claude.json")
    : path.join(os.homedir(), ".claude.json");
}

function mergeClaudeState(cfg: GrottoConfig, patch: (j: Record<string, unknown>) => void): void {
  try {
    const p = claudeStatePath(cfg);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let j: Record<string, unknown> = {};
    try {
      j = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
    } catch {
      /* fresh file */
    }
    patch(j);
    // Temp + rename: claude reads this file on every launch, and a partial write
    // (we can be mid-write while a terminal claude starts) wipes its whole state.
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(j, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, p);
  } catch {
    /* best-effort — claude will just show its dialogs */
  }
}

/** Skip the first-run onboarding wizard (theme picker etc.). */
export function preseedClaudeConfig(cfg: GrottoConfig): void {
  mergeClaudeState(cfg, (j) => {
    j.hasCompletedOnboarding = true;
    if (!j.theme) j.theme = "dark";
  });
}

/** Pre-accept the trust dialog for session workspaces we just created.
 *  Takes a list because a multi-repo session has several checkouts and each
 *  read-modify-write of the state file is a chance to clobber a concurrent one. */
export function trustWorkspaces(cfg: GrottoConfig, dirs: string[]): void {
  if (!dirs.length) return;
  mergeClaudeState(cfg, (j) => {
    const projects = (j.projects ??= {}) as Record<string, Record<string, unknown>>;
    for (const dir of dirs) {
      projects[dir] = {
        ...projects[dir],
        hasTrustDialogAccepted: true,
        hasCompletedProjectOnboarding: true,
      };
    }
  });
}

/** Single-workspace convenience over {@link trustWorkspaces}. */
export function trustWorkspace(cfg: GrottoConfig, dir: string): void {
  trustWorkspaces(cfg, [dir]);
}
