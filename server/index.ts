import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { LoginThrottle, Logins, Mfa, safeEq } from "./auth.js";
import { AgentChats } from "./agent.js";
import { cavemanStatus, setCavemanMode } from "./caveman.js";
import { ClaudeAuth } from "./claude-auth.js";
import { ClaudeOAuth } from "./claude-oauth.js";
import { doctor, repair } from "./doctor.js";
import {
  claudeTokenInfo,
  clearClaudeToken,
  gitEnv,
  loadConfig,
  preseedClaudeConfig,
  readClaudeToken,
  writeClaudeToken,
} from "./config.js";
import {
  deletePath,
  listDir,
  listTree,
  makeDir,
  movePath,
  readFile,
  statPaths,
  writeFile,
  writeFileRaw,
} from "./files.js";
import { verifyClaude } from "./claude-verify.js";
import { DIAG_HTML } from "./diag.js";
import { assertOk, parseStatus, runGit, type GitResult } from "./git.js";
import { createGithubRepo, listGithubRepos } from "./github.js";
import { HttpError, Router, sendJson, serveStatic } from "./http.js";
import { Pins } from "./pins.js";
import { proxyHttp, proxyUpgrade } from "./proxy.js";
import { searchTranscript } from "./search.js";
import { SessionManager } from "./sessions.js";
import { semanticDiff } from "./spandiff.js";

const cfg = loadConfig();
preseedClaudeConfig(cfg); // no onboarding TUI, ever — see config.ts
const manager = new SessionManager(cfg);
const chats = new AgentChats(cfg);
const claudeAuth = new ClaudeAuth(cfg);
const claudeOAuth = new ClaudeOAuth(cfg);
const mfa = new Mfa(cfg);
const pins = new Pins(cfg);
const logins = new Logins(cfg);
const throttle = new LoginThrottle();
const router = new Router();
const webRoot = path.resolve(import.meta.dirname, "../dist/web");

// ── API ─────────────────────────────────────────────────────────────────────

router.on("GET", "/api/health", () => ({ ok: true }));

// ── auth diagnostics (see /diag) ─────────────────────────────────────────────

/** Unauthenticated preflight: everything the operator needs to see WHY login
 *  might fail, without ever leaking the token itself. */
router.on("GET", "/api/preflight", () => {
  let homeWritable = false;
  try {
    const probe = path.join(cfg.home, ".diag-write-probe");
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    homeWritable = true;
  } catch {
    homeWritable = false;
  }
  const ct = claudeTokenInfo(cfg);
  return {
    ok: true,
    tokenSource: cfg.tokenSource,
    mfaEnabled: mfa.enabled(),
    home: cfg.home,
    homeWritable,
    claudeTokenPresent: ct.present,
    claudeTokenKind: ct.kind,
    claudeTokenPreview: ct.preview,
    activeLogins: logins.count(),
    gitTokenSet: !!cfg.gitToken,
    node: process.version,
  };
});

/** Authenticated: reaching this handler means the credential passed the gate. */
router.on("GET", "/api/whoami", ({ req, query }) => {
  const cred = authorized(req, query);
  return { ok: true, via: cred && safeEq(cred, cfg.token) ? "master token" : "device credential" };
});

/** Authenticated: run a real, tiny request through the agent's auth path. */
router.on("GET", "/api/claude/verify", async () => verifyClaude(cfg));

// ── login: exchange master token (+ TOTP code when MFA is on) for a 30-day
//    revocable device credential. The master token never lives on the phone. ─

router.on("POST", "/api/login", ({ body }) => {
  if (throttle.locked()) {
    throw new HttpError(429, "too many attempts", { retryAfter: throttle.retryAfter() });
  }
  const b = (body ?? {}) as { token?: string; code?: string };
  if (!b.token || !safeEq(b.token, cfg.token)) {
    throttle.fail();
    if (throttle.locked()) {
      throw new HttpError(429, "too many attempts", { retryAfter: throttle.retryAfter() });
    }
    throw new HttpError(401, "bad token", { attemptsLeft: throttle.attemptsLeft() });
  }
  if (mfa.enabled()) {
    if (!b.code) return { mfaRequired: true };
    if (!mfa.verify(b.code)) {
      throttle.fail();
      if (throttle.locked()) {
        throw new HttpError(429, "too many attempts", { retryAfter: throttle.retryAfter() });
      }
      throw new HttpError(401, "incorrect code", { attemptsLeft: throttle.attemptsLeft() });
    }
  }
  return logins.issue();
});

router.on("DELETE", "/api/login", ({ req, query }) => {
  const cred = authorized(req, query);
  if (cred) logins.revoke(cred);
  return { ok: true };
});

// ── MFA (TOTP) enrollment ───────────────────────────────────────────────────

router.on("GET", "/api/mfa", () => ({ enabled: mfa.enabled() }));

router.on("POST", "/api/mfa/setup", () => mfa.setup());

router.on("POST", "/api/mfa/enable", ({ body }) => {
  const b = (body ?? {}) as { code?: string };
  if (!b.code || !mfa.enable(b.code)) {
    throw new HttpError(400, "code didn't match — try the next one from the app");
  }
  return { ok: true };
});

router.on("POST", "/api/mfa/disable", ({ body }) => {
  const b = (body ?? {}) as { code?: string };
  if (!b.code || !mfa.disable(b.code)) {
    throw new HttpError(400, "bad or already-used code");
  }
  return { ok: true };
});

router.on("GET", "/api/config", () => ({ repos: cfg.repos }));

// ── repos: searchable list (GitHub via the PAT, configured as fallback) and
//    in-flow repo creation ─────────────────────────────────────────────────

router.on("GET", "/api/repos", async () => {
  if (!cfg.gitToken) return { repos: cfg.repos, source: "config" };
  try {
    const github = await listGithubRepos(cfg.gitToken);
    return { repos: [...new Set([...cfg.repos, ...github])], source: "github" };
  } catch {
    return { repos: cfg.repos, source: "config" };
  }
});

router.on("POST", "/api/repos", async ({ body }) => {
  if (!cfg.gitToken) {
    throw new HttpError(400, "no GROTTO_GIT_TOKEN configured — cannot create repos");
  }
  const b = (body ?? {}) as { name?: string; private?: boolean };
  if (!b.name || !/^[\w.-]{1,100}$/.test(b.name)) {
    throw new HttpError(400, "repo name: letters, digits, . _ - only");
  }
  return { repo: await createGithubRepo(cfg.gitToken, b.name, b.private !== false) };
});

router.on("GET", "/api/caveman", () => cavemanStatus(cfg.claudeConfigDir));

// The verbosity dial (Cavern status bar, future mobile control): set or clear
// the caveman mode flag that the SessionStart/UserPromptSubmit hooks read.
router.on("POST", "/api/caveman", ({ body }) => {
  const b = (body ?? {}) as { mode?: string | null };
  try {
    setCavemanMode(cfg.claudeConfigDir, b.mode ?? null);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : String(e));
  }
  return cavemanStatus(cfg.claudeConfigDir);
});

router.on("GET", "/api/doctor", async () => ({ checks: await doctor(cfg) }));

router.on("POST", "/api/doctor/repair", async () => ({ output: await repair(cfg) }));

// ── Claude subscription token (never echoed back) ──────────────────────────

router.on("GET", "/api/claude-token", () => ({
  source: readClaudeToken(cfg)
    ? "grotto"
    : process.env.CLAUDE_CODE_OAUTH_TOKEN
      ? "env"
      : null,
}));

router.on("PUT", "/api/claude-token", ({ body }) => {
  const b = (body ?? {}) as { token?: string };
  const token = b.token?.trim() ?? "";
  if (!/^[\x21-\x7e]{20,512}$/.test(token)) {
    throw new HttpError(400, "that doesn't look like a claude setup-token value");
  }
  writeClaudeToken(cfg, token);
  return { ok: true };
});

router.on("DELETE", "/api/claude-token", () => {
  clearClaudeToken(cfg);
  return { ok: true };
});

// ── guided Claude connect: setup-token runs in a hidden server-side PTY;
//    the client only ever sees {state, url} and posts the return code ────────

router.on("GET", "/api/claude-auth", () => claudeAuth.status());

router.on("POST", "/api/claude-auth/start", () => claudeAuth.start());

router.on("POST", "/api/claude-auth/code", ({ body }) => {
  const b = (body ?? {}) as { code?: string };
  const code = b.code?.trim() ?? "";
  if (!/^[\x21-\x7e]{4,512}$/.test(code)) {
    throw new HttpError(400, "that doesn't look like an authorization code");
  }
  return claudeAuth.submitCode(code);
});

router.on("POST", "/api/claude-auth/cancel", () => claudeAuth.cancel());

// Direct OAuth (PKCE) — deterministic code→token exchange, no PTY.
router.on("POST", "/api/claude-oauth/start", () => claudeOAuth.start());
router.on("POST", "/api/claude-oauth/exchange", async ({ body }) => {
  const b = (body ?? {}) as { code?: string };
  if (!b.code?.trim()) throw new HttpError(400, "code required");
  return claudeOAuth.exchange(b.code);
});

router.on("GET", "/api/sessions", () =>
  manager.list().map((s) => {
    // Merge chat-side signals: a pending native approval means "needs you"
    // exactly like a TUI dialog does, and the chat knows the active model.
    const chat = chats.peek(s.id);
    const ask = chat?.pendingApprovalTitle ?? null;
    return {
      ...s,
      needsYou: s.needsYou || ask !== null,
      approval: s.approval ?? ask,
      model: s.model ?? chat?.model ?? null,
    };
  }),
);

// ── native agent chat (headless Claude Code via the Agent SDK) ──────────────

router.on("POST", "/api/sessions/:id/chat/message", ({ params, body }) => {
  const b = (body ?? {}) as { text?: string };
  const text = b.text?.trim();
  if (!text) throw new HttpError(400, "text is required");
  const s = manager.get(params.id);
  chats.get(s.id, s.dir).send(text);
  return { ok: true };
});

router.on("POST", "/api/sessions/:id/chat/approval", ({ params, body }) => {
  const b = (body ?? {}) as { id?: string; decision?: string };
  if (!b.id || !["allow", "always", "deny"].includes(b.decision ?? "")) {
    throw new HttpError(400, "id and decision (allow|always|deny) required");
  }
  const s = manager.get(params.id);
  const ok = chats.get(s.id, s.dir).resolveApproval(b.id, b.decision as "allow" | "always" | "deny");
  if (!ok) throw new HttpError(409, "that request is no longer pending");
  return { ok: true };
});

router.on("POST", "/api/sessions/:id/chat/interrupt", async ({ params }) => {
  const s = manager.get(params.id);
  await chats.get(s.id, s.dir).interrupt();
  return { ok: true };
});

router.on("POST", "/api/sessions/:id/chat/model", async ({ params, body }) => {
  const b = (body ?? {}) as { model?: string | null };
  const s = manager.get(params.id);
  await chats.get(s.id, s.dir).setModel(b.model?.trim() || null);
  return { ok: true };
});

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
router.on("POST", "/api/sessions/:id/chat/effort", async ({ params, body }) => {
  const b = (body ?? {}) as { effort?: string | null };
  const e = b.effort?.trim() || null;
  if (e && !EFFORTS.includes(e as (typeof EFFORTS)[number])) throw new HttpError(400, "invalid effort");
  const s = manager.get(params.id);
  await chats.get(s.id, s.dir).setEffort(e as (typeof EFFORTS)[number] | null);
  return { ok: true };
});

router.on("POST", "/api/sessions", async ({ body }) => {
  const b = (body ?? {}) as { repo?: string; branch?: string };
  if (!b.repo) throw new HttpError(400, "repo is required");
  const session = await manager.create(b.repo, b.branch?.trim() || null);
  return session.info();
});

router.on("DELETE", "/api/sessions/:id", ({ params }) => {
  chats.destroy(params.id);
  manager.destroy(params.id);
  pins.clear(params.id);
  return { ok: true };
});

// ── pins (keep-in-context store, per session) ────────────────────────────────

router.on("GET", "/api/sessions/:id/pins", ({ params }) => ({ pins: pins.list(params.id) }));

router.on("POST", "/api/sessions/:id/pins", ({ params, body }) => {
  const b = (body ?? {}) as { icon?: string; label?: string };
  if (!b.label?.trim()) throw new HttpError(400, "label required");
  const pin = pins.add(params.id, b.icon ?? "pin", b.label);
  return { pin };
});

router.on("DELETE", "/api/sessions/:id/pins/:pinId", ({ params }) => ({
  pins: pins.remove(params.id, params.pinId),
}));

// ── transcript search (⌘K over the session's chat log) ───────────────────────

router.on("GET", "/api/sessions/:id/transcript/search", ({ params, query }) => ({
  hits: searchTranscript(cfg, params.id, query.get("q") ?? ""),
}));

// ── files ───────────────────────────────────────────────────────────────────

router.on("GET", "/api/sessions/:id/files", ({ params, query }) =>
  listDir(manager.get(params.id).dir, query.get("path") ?? ""),
);

router.on("GET", "/api/sessions/:id/tree", ({ params }) => ({
  files: listTree(manager.get(params.id).dir),
}));

router.on("GET", "/api/sessions/:id/file", ({ params, query }) => {
  const p = query.get("path");
  if (!p) throw new HttpError(400, "path is required");
  return readFile(manager.get(params.id).dir, p);
});

router.on("PUT", "/api/sessions/:id/file", ({ params, body }) => {
  const b = (body ?? {}) as { path?: string; content?: string };
  if (!b.path || typeof b.content !== "string") {
    throw new HttpError(400, "path and content are required");
  }
  writeFile(manager.get(params.id).dir, b.path, b.content);
  return { ok: true };
});

router.on("DELETE", "/api/sessions/:id/file", ({ params, query }) => {
  const p = query.get("path");
  if (!p) throw new HttpError(400, "path is required");
  deletePath(manager.get(params.id).dir, p);
  return { ok: true };
});

router.on("POST", "/api/sessions/:id/file/move", ({ params, body }) => {
  const b = (body ?? {}) as { from?: string; to?: string };
  if (!b.from || !b.to) throw new HttpError(400, "from and to are required");
  movePath(manager.get(params.id).dir, b.from, b.to);
  return { ok: true };
});

router.on("POST", "/api/sessions/:id/mkdir", ({ params, body }) => {
  const b = (body ?? {}) as { path?: string };
  if (!b.path) throw new HttpError(400, "path is required");
  makeDir(manager.get(params.id).dir, b.path);
  return { ok: true };
});

router.on(
  "POST",
  "/api/sessions/:id/upload",
  ({ params, query, body }) => {
    const p = query.get("path");
    if (!p) throw new HttpError(400, "path is required");
    if (!Buffer.isBuffer(body)) throw new HttpError(400, "raw body required");
    writeFileRaw(manager.get(params.id).dir, p, body);
    return { ok: true, path: p, bytes: body.length };
  },
  { raw: true },
);

router.on("GET", "/api/sessions/:id/stat", ({ params, query }) => {
  const paths = (query.get("paths") ?? "").split(",").filter(Boolean);
  return statPaths(manager.get(params.id).dir, paths);
});

// ── git ─────────────────────────────────────────────────────────────────────

router.on("GET", "/api/sessions/:id/git/status", async ({ params }) => {
  const dir = manager.get(params.id).dir;
  const r = assertOk(
    await runGit(dir, ["status", "--porcelain=v2", "--branch"], gitEnv(cfg)),
    "status",
  );
  return parseStatus(r.stdout);
});

router.on("GET", "/api/sessions/:id/git/log", async ({ params }) => {
  const dir = manager.get(params.id).dir;
  const r = assertOk(
    await runGit(dir, ["log", "--format=%h%x1f%s%x1f%cr%x1e", "-n", "50"], gitEnv(cfg)),
    "log",
  );
  const entries = r.stdout
    .split("\x1e")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, when] = line.split("\x1f");
      return { sha, subject, when };
    });
  return { entries };
});

router.on("GET", "/api/sessions/:id/git/diff", async ({ params, query }) => {
  const dir = manager.get(params.id).dir;
  const p = query.get("path");
  const args = p ? ["diff", "HEAD", "--", p] : ["diff", "HEAD"];
  let r = await runGit(dir, args, gitEnv(cfg));
  if (r.code === 0 && !r.stdout.trim() && p) {
    // Untracked file — no-index diff against /dev/null exits 1 by design.
    r = await runGit(dir, ["diff", "--no-index", "--", "/dev/null", p], gitEnv(cfg));
  }
  return { diff: r.stdout };
});

/**
 * Semantic span diff — the review-hero engine. `old` = HEAD:path (empty for an
 * untracked/new file), `new` = working-tree content. Returns token-level inline
 * ops + move blocks (see server/spandiff.ts), not a raw unified-diff string.
 */
router.on("GET", "/api/sessions/:id/git/diff/semantic", async ({ params, query }) => {
  const dir = manager.get(params.id).dir;
  const p = query.get("path");
  if (!p) throw new HttpError(400, "path required");
  // Old side: HEAD:path. A new/untracked file has no HEAD blob → empty.
  const head = await runGit(dir, ["show", `HEAD:${p}`], gitEnv(cfg));
  const oldText = head.code === 0 ? head.stdout : "";
  // New side: the working-tree file. A deleted file reads as missing → empty.
  let newText = "";
  try {
    const f = readFile(dir, p);
    if (f.binary) return { binary: true, path: p };
    newText = f.content;
  } catch {
    newText = "";
  }
  return semanticDiff(oldText, newText);
});

/** Deterministic commit message for one-tap Sync — no tokens spent. */
function autoMessage(entries: Array<{ path: string }>): string {
  const names = entries
    .slice(0, 3)
    .map((e) => e.path.split("/").pop())
    .join(", ");
  const n = entries.length;
  return `sync: ${n} file${n === 1 ? "" : "s"} — ${names}${n > 3 ? ", …" : ""}`;
}

const out = (r: GitResult) => (r.stdout + r.stderr).trim();

router.on("POST", "/api/sessions/:id/git", async ({ params, body }) => {
  const dir = manager.get(params.id).dir;
  const env = gitEnv(cfg);
  const b = (body ?? {}) as { op?: string; message?: string; branch?: string; sha?: string };
  switch (b.op) {
    case "commit": {
      if (!b.message?.trim()) throw new HttpError(400, "commit message required");
      assertOk(await runGit(dir, ["add", "-A"], env), "add");
      const r = assertOk(await runGit(dir, ["commit", "-m", b.message], env), "commit");
      return { output: out(r) };
    }
    case "push": {
      const r = assertOk(await runGit(dir, ["push", "-u", "origin", "HEAD"], env), "push");
      return { output: out(r) };
    }
    case "pull": {
      const r = assertOk(await runGit(dir, ["pull", "--ff-only"], env), "pull");
      return { output: out(r) };
    }
    case "checkout": {
      if (!b.branch?.trim()) throw new HttpError(400, "branch required");
      const r = assertOk(await runGit(dir, ["checkout", "-B", b.branch], env), "checkout");
      return { output: out(r) };
    }
    // One-tap sync: commit everything (auto message), rebase on upstream, push.
    case "sync": {
      const st = parseStatus(
        assertOk(
          await runGit(dir, ["status", "--porcelain=v2", "--branch"], env),
          "status",
        ).stdout,
      );
      let log = "";
      if (st.entries.length > 0) {
        assertOk(await runGit(dir, ["add", "-A"], env), "add");
        const msg = b.message?.trim() || autoMessage(st.entries);
        log += out(assertOk(await runGit(dir, ["commit", "-m", msg], env), "commit")) + "\n";
      }
      const pull = await runGit(dir, ["pull", "--rebase", "--autostash"], env);
      if (pull.code !== 0) {
        if (!/no tracking information|couldn't find remote ref/i.test(out(pull))) {
          await runGit(dir, ["rebase", "--abort"], env); // best-effort unwedge
          throw new HttpError(422, `sync: pull failed — ${out(pull)}`);
        }
      } else {
        log += out(pull) + "\n";
      }
      const push = assertOk(await runGit(dir, ["push", "-u", "origin", "HEAD"], env), "push");
      return { output: (log + out(push)).trim() || "already in sync" };
    }
    // Timeline revert: hard-reset the workspace to a previous commit.
    case "reset": {
      if (!b.sha || !/^[0-9a-f]{6,40}$/i.test(b.sha)) throw new HttpError(400, "bad sha");
      const r = assertOk(await runGit(dir, ["reset", "--hard", b.sha], env), "reset");
      return { output: out(r) };
    }
    default:
      throw new HttpError(400, `unknown op: ${b.op ?? "(none)"}`);
  }
});

// ── auth ────────────────────────────────────────────────────────────────────

function cookies(req: http.IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of (req.headers.cookie ?? "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx > 0) result[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return result;
}

function presented(req: http.IncomingMessage, query: URLSearchParams): string | null {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  // Query token serves WS URLs; the cookie serves the preview iframe, whose
  // asset/HMR requests can't carry a header (set on first credentialed hit).
  return query.get("token") ?? cookies(req).grotto ?? null;
}

/**
 * Returns the credential that authorized this request, or null.
 * Device credentials (issued by /api/login) always work. The master token
 * works directly ONLY while MFA is off — once MFA is on, the token alone
 * must not grant access, or the second factor would be decorative.
 */
function authorized(req: http.IncomingMessage, query: URLSearchParams): string | null {
  const cred = presented(req, query);
  if (!cred) return null;
  if (logins.verify(cred)) return cred;
  if (!mfa.enabled() && safeEq(cred, cfg.token)) return cred;
  return null;
}

// ── preview proxy routing ───────────────────────────────────────────────────

const PREVIEW_RE = /^\/preview\/([a-f0-9]+)\/(\d{2,5})(\/.*)?$/;

interface PreviewTarget {
  id: string;
  port: number;
  rest: string;
}

function matchPreview(pathname: string): PreviewTarget | null {
  const m = pathname.match(PREVIEW_RE);
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1024 || port > 65535) return null;
  return { id: m[1], port, rest: m[3] ?? "/" };
}

/**
 * Dev servers use root-relative URLs (/assets/x.js, /api/data) that escape the
 * /preview prefix. Requests from a preview page carry a Referer pointing back
 * at /preview/:id/:port/, so route them to the same target.
 */
function refererPreview(req: http.IncomingMessage): PreviewTarget | null {
  const ref = req.headers.referer;
  if (!ref) return null;
  try {
    const m = new URL(ref).pathname.match(/^\/preview\/([a-f0-9]+)\/(\d{2,5})(\/|$)/);
    if (!m) return null;
    const port = Number(m[2]);
    if (port < 1024 || port > 65535) return null;
    return { id: m[1], port, rest: "/" };
  } catch {
    return null;
  }
}

/** Last preview target, for HMR websockets that carry neither prefix nor referer. */
function cookiePreview(req: http.IncomingMessage): PreviewTarget | null {
  const raw = cookies(req).grotto_preview ?? "";
  const m = raw.match(/^([a-f0-9]+):(\d{2,5})$/);
  return m ? { id: m[1], port: Number(m[2]), rest: "/" } : null;
}

// ── HTTP server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://local");

  const preview = matchPreview(url.pathname);
  if (preview) {
    const cred = authorized(req, url.searchParams);
    if (!cred) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    try {
      manager.get(preview.id);
    } catch {
      sendJson(res, 404, { error: "no such session" });
      return;
    }
    // Persist auth + target so the page's root-relative follow-ups work.
    res.setHeader("Set-Cookie", [
      `grotto=${cred}; Path=/; HttpOnly; SameSite=Lax`,
      `grotto_preview=${preview.id}:${preview.port}; Path=/; SameSite=Lax`,
    ]);
    url.searchParams.delete("token");
    const qs = url.searchParams.toString();
    proxyHttp(req, res, preview.port, preview.rest + (qs ? `?${qs}` : ""));
    return;
  }

  // Root-relative escapees from a preview page (assets, the app's own /api).
  // Checked before Grotto's /api so a previewed app's API calls reach IT.
  const fallback = refererPreview(req);
  if (fallback && authorized(req, url.searchParams)) {
    proxyHttp(req, res, fallback.port, (req.url ?? "/").replace(/^\/+/, "/"));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    const open =
      url.pathname === "/api/health" ||
      url.pathname === "/api/preflight" ||
      (url.pathname === "/api/login" && req.method === "POST");
    if (!open && !authorized(req, url.searchParams)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    const handled = await router.handle(req, res);
    if (!handled) sendJson(res, 404, { error: "not found" });
    return;
  }

  // Standalone auth console — no auth, no React app, always available.
  if (url.pathname === "/diag" || url.pathname === "/diag.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(DIAG_HTML);
    return;
  }

  serveStatic(webRoot, req, res);
});

// ── WebSocket upgrades: terminal, preview, HMR fallback ─────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://local");

  const term = url.pathname.match(/^\/api\/sessions\/([^/]+)\/term$/);
  if (term) {
    if (!authorized(req, url.searchParams)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const id = term[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        void manager.get(id).attach(ws);
      } catch {
        ws.close(4004, "no such session");
      }
    });
    return;
  }

  const chat = url.pathname.match(/^\/api\/sessions\/([^/]+)\/chat$/);
  if (chat) {
    if (!authorized(req, url.searchParams)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const id = chat[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        const s = manager.get(id);
        chats.get(s.id, s.dir).attach(ws);
      } catch {
        ws.close(4004, "no such session");
      }
    });
    return;
  }

  if (!authorized(req, url.searchParams)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const preview = matchPreview(url.pathname);
  if (preview) {
    proxyUpgrade(req, socket, head, preview.port, preview.rest + url.search);
    return;
  }

  // HMR sockets connect at the dev server's own path (usually "/") with no
  // preview prefix — the grotto_preview cookie remembers where they belong.
  const fallback = cookiePreview(req);
  if (fallback && !url.pathname.startsWith("/api/")) {
    proxyUpgrade(req, socket, head, fallback.port, req.url ?? "/");
    return;
  }

  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

server.listen(cfg.port, () => {
  console.log(`grotto listening on http://localhost:${cfg.port}`);
  console.log(`grotto token: ${cfg.token}`);
  if (cfg.repos.length === 0) {
    console.log(
      "no repos configured — set GROTTO_REPOS=owner/repo,... or repos[] in " +
        path.join(cfg.home, "config.json"),
    );
  }
});
