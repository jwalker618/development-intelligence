export interface SessionInfo {
  id: string;
  repo: string;
  branch: string | null;
  createdAt: number;
  ptyLive: boolean;
  setup: "none" | "running" | "done" | "failed";
  needsYou: boolean;
  approval: string | null;
  lastLine: string | null;
  lastOutputAt: number | null;
  model: string | null;
  /** Every checkout in the session. `repos[0]` is the primary and mirrors the
   *  `repo`/`branch` fields above. Absent from a pre-multi-repo server. */
  repos?: RepoRef[];
}

/** One checkout inside a session. `name` is the handle used in `?repo=`. */
export interface RepoRef {
  repo: string;
  branch: string | null;
  name: string;
  status: "cloning" | "ready" | "failed";
  error?: string;
}

export interface CavemanStatus {
  mode: string | null;
  savings: string | null;
}

export interface DirEntry {
  name: string;
  type: "dir" | "file";
}

export interface FileContent {
  path: string;
  content: string;
  binary: boolean;
  truncated: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  entries: Array<{ status: string; path: string }>;
  /** Present only when asked for with `all` — one entry per checkout, in slot
   *  order. The top-level fields above always mirror `repos[0]`. */
  repos?: RepoStatus[];
}

export interface RepoStatus extends GitStatus {
  name: string;
  repo: string;
  /** Set when this checkout could not be read (failed clone, corrupt tree). */
  error?: string;
}

export interface GitLogEntry {
  sha: string;
  subject: string;
  when: string;
}

/** Real per-turn usage ledger (server/usage.ts) — the basis for the RTK and
 *  caveman efficiency tiles. No fabricated numbers. */
export interface ModeStat { mode: string; turns: number; avgOutputTokens: number; avgTotalTokens: number; avgCostUsd: number }
export interface UsageSummary {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  costUsd: number;
  cacheHitPct: number | null;
  byMode: ModeStat[];
  cavemanDelta: { best: string; worst: string; outputTokenReductionPct: number } | null;
  recent: Array<{ at: number; mode: string; model: string | null; inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number; durationMs: number }>;
}

/** One row of the live model catalog (server/models.ts). */
export interface ModelRow {
  value: string;
  resolvedModel?: string;
  displayName: string;
  description: string;
  supportsEffort: boolean;
  supportedEffortLevels: string[];
}
export interface ModelCatalog {
  models: ModelRow[];
  source: "live" | "cache" | "fallback";
  error?: string;
}

/** Semantic span-diff (server/spandiff.ts): token-level inline ops + move blocks. */
/** Everything the CLI can tell us about the session it is running. */
export interface ChatStatus {
  signals: {
    commands: SlashCommandInfo[]; skills: string[]; agents: string[]; tools: string[];
    plugins: Array<{ name: string; version?: string }>;
    mcpServers: Array<{ name: string; status: string }>;
    betas: string[]; outputStyle: string | null; permissionMode: string | null;
    apiKeySource: string | null; cliVersion: string | null;
  };
  hooks: Array<{ at: number; name: string; event: string; outcome: string; exitCode: number | null }>;
  /** Agent-initiated work in flight (subagents, background commands). */
  tasks: LiveTask[];
  cliState: string | null;
  /** Live reasoning-token estimate for the turn in flight. */
  thinkingTokens: number;
  /** The model's own suggested follow-up, when it offered one. */
  suggestion: string | null;
  maxTurns: number | null;
  permissionMode: string;
  readOnly: boolean;
  budgetUsd: number | null;
  /** False on subscription auth and 3P providers, where dollar figures are
   *  notional. Gate every cost tile on it rather than showing an unreconcilable
   *  number. */
  costsAreReal: boolean;
  /** The CLI has an account — proof of a working credential, unlike the
   *  stored-token check the front door uses as a proxy. */
  authenticated: boolean;
  /** Live context-window accounting. Null until the CLI is warm. */
  context: ContextUsage | null;
  account: { email?: string; organization?: string; subscriptionType?: string; apiProvider?: string } | null;
  limits: { status?: string; resetsAt?: number; rateLimitType?: string; utilization?: number } | null;
}

export interface SlashCommandInfo { name: string; description: string; argumentHint?: string }

export interface LiveTask { id: string; label: string; status: string; detail: string | null; at: number }

/** What a rewind would (or did) restore. */
export interface RewindResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface ContextUsage {
  categories: Array<{ name: string; tokens: number; color: string; isDeferred?: boolean }>;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
  memoryFiles: Array<{ path: string; type: string; tokens: number }>;
  mcpTools: Array<{ name: string; serverName: string; tokens: number }>;
}

export interface ChatDiag {
  stderr: string[];
  signals: ChatStatus["signals"];
  hooks: ChatStatus["hooks"];
  settingSources: string[];
  settingSourcesNote: string;
}

export interface SpanOp { kind: "equal" | "insert" | "delete"; text: string }
export interface SpanLine {
  no: number | null;
  kind: "context" | "add" | "del" | "replace";
  text?: string;
  ops?: SpanOp[];
}
export interface SpanHunk { header: string; lines: SpanLine[] }
export interface SpanMove { count: number; text: string; toLine: number }
export interface SpanDiffResponse {
  hunks?: SpanHunk[];
  moves?: SpanMove[];
  add?: number;
  del?: number;
  truncated?: boolean;
  binary?: boolean;
}

/** A pinned "keep in context" item (server/pins.ts). */
export interface PinRecord {
  id: string;
  icon: string;
  label: string;
  createdAt: number;
}

/** One transcript-search hit (server/search.ts). */
export interface SearchHit {
  seq: number;
  at: number;
  kind: string;
  role: "user" | "agent" | "tool" | "approval" | "system";
  snippet: string;
}

/** Structured chat event from the server-side headless Claude Code session. */
export interface ChatEvent {
  seq: number;
  at: number;
  kind:
    | "init"
    | "user"
    | "text"
    | "tool"
    | "tool_done"
    | "approval"
    | "approval_done"
    | "result"
    | "error";
  [k: string]: unknown;
}

export interface ClaudeAuthStatus {
  state: "idle" | "starting" | "awaiting-code" | "verifying" | "done" | "error";
  url: string | null;
  detail: string | null;
  tail: string;
}

const CRED_KEY = "grotto-cred";
const LEGACY_KEY = "grotto-token";

export function getToken(): string {
  return localStorage.getItem(CRED_KEY) ?? localStorage.getItem(LEGACY_KEY) ?? "";
}

export function setToken(credential: string): void {
  if (credential) localStorage.setItem(CRED_KEY, credential);
  else localStorage.removeItem(CRED_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(CRED_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

/** `&repo=<name>` when targeting a secondary checkout, otherwise nothing (the
 *  server then uses the primary). Always emitted with a leading `&`, so every
 *  call site can append it to a query string that may already be empty. */
const qRepo = (repo?: string): string => (repo ? `&repo=${encodeURIComponent(repo)}` : "");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${getToken()}`,
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export interface LoginResult {
  credential?: string;
  expiresAt?: number;
  mfaRequired?: boolean;
}

/** Auth error carrying the machine-readable fields the login UI renders. */
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
    public attemptsLeft?: number,
  ) {
    super(message);
  }
}

/** Exchange the master token (+ TOTP code if MFA is on) for a device credential. */
export async function login(token: string, code?: string): Promise<LoginResult> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, code }),
  });
  const data = (await res.json().catch(() => ({}))) as LoginResult & {
    error?: string;
    retryAfter?: number;
    attemptsLeft?: number;
  };
  if (!res.ok) {
    throw new AuthError(
      data.error ?? `HTTP ${res.status}`,
      res.status,
      data.retryAfter,
      data.attemptsLeft,
    );
  }
  return data;
}

export const api = {
  config: () => req<{ repos: string[] }>("/api/config"),
  repos: () => req<{ repos: string[]; source: "github" | "config" }>("/api/repos"),
  createRepo: (name: string, isPrivate: boolean) =>
    req<{ repo: string }>("/api/repos", {
      method: "POST",
      body: JSON.stringify({ name, private: isPrivate }),
    }),
  caveman: () => req<CavemanStatus>("/api/caveman"),
  models: (sessionId?: string, refresh = false) =>
    req<ModelCatalog>(
      `/api/models${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}${refresh ? (sessionId ? "&" : "?") + "refresh=1" : ""}`,
    ),
  logout: () => req("/api/login", { method: "DELETE" }),
  mfa: () => req<{ enabled: boolean }>("/api/mfa"),
  mfaSetup: () =>
    req<{ secret: string; otpauth: string }>("/api/mfa/setup", { method: "POST" }),
  mfaEnable: (code: string) =>
    req("/api/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  mfaDisable: (code: string) =>
    req("/api/mfa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  doctor: () =>
    req<{ checks: Array<{ id: string; label: string; ok: boolean; detail: string }> }>(
      "/api/doctor",
    ),
  repair: () => req<{ output: string }>("/api/doctor/repair", { method: "POST" }),
  claudeToken: () => req<{ source: "grotto" | "env" | null }>("/api/claude-token"),
  claudeAuth: () => req<ClaudeAuthStatus>("/api/claude-auth"),
  claudeAuthStart: () => req<ClaudeAuthStatus>("/api/claude-auth/start", { method: "POST" }),
  claudeAuthCode: (code: string) =>
    req<ClaudeAuthStatus>("/api/claude-auth/code", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  claudeAuthCancel: () =>
    req<ClaudeAuthStatus>("/api/claude-auth/cancel", { method: "POST" }),
  setClaudeToken: (token: string) =>
    req("/api/claude-token", { method: "PUT", body: JSON.stringify({ token }) }),
  clearClaudeToken: () => req("/api/claude-token", { method: "DELETE" }),
  sessions: () => req<SessionInfo[]>("/api/sessions"),
  /** The first entry becomes the primary checkout (the agent's cwd). */
  createSession: (repos: Array<{ repo: string; branch: string | null }>) =>
    req<SessionInfo>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ repos }),
    }),
  addRepo: (id: string, repo: string, branch: string | null) =>
    req<SessionInfo>(`/api/sessions/${id}/repos`, {
      method: "POST",
      body: JSON.stringify({ repo, branch: branch || undefined }),
    }),
  removeRepo: (id: string, name: string) =>
    req<SessionInfo>(`/api/sessions/${id}/repos/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  deleteSession: (id: string) => req(`/api/sessions/${id}`, { method: "DELETE" }),
  files: (id: string, path: string, repo?: string) =>
    req<DirEntry[]>(`/api/sessions/${id}/files?path=${encodeURIComponent(path)}${qRepo(repo)}`),
  tree: (id: string, repo?: string) =>
    req<{ files: string[] }>(`/api/sessions/${id}/tree?${qRepo(repo).slice(1)}`),
  file: (id: string, path: string, repo?: string) =>
    req<FileContent>(`/api/sessions/${id}/file?path=${encodeURIComponent(path)}${qRepo(repo)}`),
  saveFile: (id: string, path: string, content: string, repo?: string) =>
    req(`/api/sessions/${id}/file?${qRepo(repo).slice(1)}`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  deletePath: (id: string, path: string, repo?: string) =>
    req(`/api/sessions/${id}/file?path=${encodeURIComponent(path)}${qRepo(repo)}`, {
      method: "DELETE",
    }),
  move: (id: string, from: string, to: string, repo?: string) =>
    req(`/api/sessions/${id}/file/move?${qRepo(repo).slice(1)}`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  mkdir: (id: string, path: string, repo?: string) =>
    req(`/api/sessions/${id}/mkdir?${qRepo(repo).slice(1)}`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  upload: async (id: string, path: string, file: File, repo?: string) => {
    const res = await fetch(
      `/api/sessions/${id}/upload?path=${encodeURIComponent(path)}${qRepo(repo)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${getToken()}`,
          "content-type": "application/octet-stream",
        },
        body: file,
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  },
  stat: (id: string, paths: string[], repo?: string) =>
    req<Array<{ path: string; bytes: number | null }>>(
      `/api/sessions/${id}/stat?paths=${encodeURIComponent(paths.join(","))}${qRepo(repo)}`,
    ),
  /** `all` folds every checkout into `repos[]` in one round trip. */
  gitStatus: (id: string, opts?: { repo?: string; all?: boolean }) =>
    req<GitStatus>(
      `/api/sessions/${id}/git/status?${opts?.all ? "all=1" : ""}${qRepo(opts?.repo)}`,
    ),
  gitLog: (id: string, repo?: string) =>
    req<{ entries: GitLogEntry[] }>(`/api/sessions/${id}/git/log?${qRepo(repo).slice(1)}`),
  gitDiff: (id: string, path?: string, repo?: string) =>
    req<{ diff: string }>(
      `/api/sessions/${id}/git/diff?${path ? `path=${encodeURIComponent(path)}` : ""}${qRepo(repo)}`,
    ),
  gitDiffSemantic: (id: string, path: string, repo?: string) =>
    req<SpanDiffResponse>(
      `/api/sessions/${id}/git/diff/semantic?path=${encodeURIComponent(path)}${qRepo(repo)}`,
    ),
  searchTranscript: (id: string, q: string) =>
    req<{ hits: SearchHit[] }>(
      `/api/sessions/${id}/transcript/search?q=${encodeURIComponent(q)}`,
    ),
  usage: (id: string) => req<UsageSummary>(`/api/sessions/${id}/usage`),
  /** `warm` starts the CLI first — without a running query the context meter,
   *  account and inventories have no data source at all. */
  chatStatus: (id: string, warm = false) =>
    req<ChatStatus>(`/api/sessions/${id}/chat/status${warm ? "?warm=1" : ""}`),
  chatDiag: (id: string) => req<ChatDiag>(`/api/sessions/${id}/chat/diag`),
  setPermissionMode: (id: string, mode: string) =>
    req<{ mode: string }>(`/api/sessions/${id}/chat/permission-mode`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  setReadOnly: (id: string, readOnly: boolean) =>
    req<{ readOnly: boolean }>(`/api/sessions/${id}/chat/read-only`, {
      method: "POST",
      body: JSON.stringify({ readOnly }),
    }),
  /** Preview by default; only `dryRun: false` touches the disk. */
  rewind: (id: string, uuid: string, dryRun = true) =>
    req<RewindResult>(`/api/sessions/${id}/chat/rewind`, {
      method: "POST",
      body: JSON.stringify({ uuid, dryRun }),
    }),
  setMaxTurns: (id: string, maxTurns: number | null) =>
    req<{ maxTurns: number | null }>(`/api/sessions/${id}/chat/max-turns`, {
      method: "POST",
      body: JSON.stringify({ maxTurns }),
    }),
  setBudget: (id: string, budgetUsd: number | null) =>
    req<{ budgetUsd: number | null }>(`/api/sessions/${id}/chat/budget`, {
      method: "POST",
      body: JSON.stringify({ budgetUsd }),
    }),
  pins: (id: string) => req<{ pins: PinRecord[] }>(`/api/sessions/${id}/pins`),
  addPin: (id: string, icon: string, label: string) =>
    req<{ pin: PinRecord }>(`/api/sessions/${id}/pins`, {
      method: "POST",
      body: JSON.stringify({ icon, label }),
    }),
  removePin: (id: string, pinId: string) =>
    req<{ pins: PinRecord[] }>(`/api/sessions/${id}/pins/${encodeURIComponent(pinId)}`, {
      method: "DELETE",
    }),
  chatMessage: (id: string, text: string) =>
    req(`/api/sessions/${id}/chat/message`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  chatApproval: (
    id: string,
    approvalId: string,
    decision: "allow" | "always" | "deny" | "stop",
    input?: Record<string, unknown>,
  ) =>
    req(`/api/sessions/${id}/chat/approval`, {
      method: "POST",
      body: JSON.stringify(input ? { id: approvalId, decision, input } : { id: approvalId, decision }),
    }),
  chatInterrupt: (id: string) =>
    req(`/api/sessions/${id}/chat/interrupt`, { method: "POST" }),
  chatEffort: (id: string, effort: string | null) =>
    req(`/api/sessions/${id}/chat/effort`, {
      method: "POST",
      body: JSON.stringify({ effort }),
    }),
  chatModel: (id: string, model: string | null) =>
    req(`/api/sessions/${id}/chat/model`, {
      method: "POST",
      body: JSON.stringify({ model }),
    }),
  gitOp: (
    id: string,
    body: { op: string; message?: string; branch?: string; sha?: string },
    repo?: string,
  ) =>
    req<{ output: string }>(`/api/sessions/${id}/git?${qRepo(repo).slice(1)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export function previewUrl(sessionId: string, port: number): string {
  return `/preview/${sessionId}/${port}/?token=${encodeURIComponent(getToken())}`;
}

export function termUrl(sessionId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/sessions/${sessionId}/term?token=${encodeURIComponent(getToken())}`;
}

export function chatUrl(sessionId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/sessions/${sessionId}/chat?token=${encodeURIComponent(getToken())}`;
}
