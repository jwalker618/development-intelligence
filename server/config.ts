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
function resolveToken(home: string): string {
  const fromEnv = process.env.GROTTO_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const tokenPath = path.join(home, "token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* fall through to generate */
  }
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(tokenPath, token + "\n", { mode: 0o600 });
  return token;
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

  return {
    home,
    port: Number(process.env.PORT ?? file.port ?? 4870),
    token: resolveToken(home),
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

/** Full environment for session processes (PTY, setup): git auth + agent auth. */
export function sessionEnv(cfg: GrottoConfig): NodeJS.ProcessEnv {
  const env = gitEnv(cfg);
  const token = readClaudeToken(cfg);
  if (token) {
    env.CLAUDE_CODE_OAUTH_TOKEN = token;
    // The subscription token is authoritative. A stray ANTHROPIC_API_KEY in the
    // host env (a very common Railway setting) would otherwise put the CLI in
    // API-key mode and shadow the OAuth token — the classic "auth failed" even
    // though a valid setup-token is present. Remove it so OAuth wins.
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
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
    fs.writeFileSync(p, JSON.stringify(j, null, 2), { mode: 0o600 });
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

/** Pre-accept the trust dialog for a session workspace we just created. */
export function trustWorkspace(cfg: GrottoConfig, dir: string): void {
  mergeClaudeState(cfg, (j) => {
    const projects = (j.projects ??= {}) as Record<string, Record<string, unknown>>;
    projects[dir] = {
      ...projects[dir],
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
    };
  });
}
