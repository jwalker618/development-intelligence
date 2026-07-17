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
}

export interface GitLogEntry {
  sha: string;
  subject: string;
  when: string;
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
  createSession: (repo: string, branch: string) =>
    req<SessionInfo>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ repo, branch: branch || undefined }),
    }),
  deleteSession: (id: string) => req(`/api/sessions/${id}`, { method: "DELETE" }),
  files: (id: string, path: string) =>
    req<DirEntry[]>(`/api/sessions/${id}/files?path=${encodeURIComponent(path)}`),
  tree: (id: string) => req<{ files: string[] }>(`/api/sessions/${id}/tree`),
  file: (id: string, path: string) =>
    req<FileContent>(`/api/sessions/${id}/file?path=${encodeURIComponent(path)}`),
  saveFile: (id: string, path: string, content: string) =>
    req(`/api/sessions/${id}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  deletePath: (id: string, path: string) =>
    req(`/api/sessions/${id}/file?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    }),
  move: (id: string, from: string, to: string) =>
    req(`/api/sessions/${id}/file/move`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  mkdir: (id: string, path: string) =>
    req(`/api/sessions/${id}/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  upload: async (id: string, path: string, file: File) => {
    const res = await fetch(
      `/api/sessions/${id}/upload?path=${encodeURIComponent(path)}`,
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
  stat: (id: string, paths: string[]) =>
    req<Array<{ path: string; bytes: number | null }>>(
      `/api/sessions/${id}/stat?paths=${encodeURIComponent(paths.join(","))}`,
    ),
  gitStatus: (id: string) => req<GitStatus>(`/api/sessions/${id}/git/status`),
  gitLog: (id: string) => req<{ entries: GitLogEntry[] }>(`/api/sessions/${id}/git/log`),
  gitDiff: (id: string, path?: string) =>
    req<{ diff: string }>(
      `/api/sessions/${id}/git/diff${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    ),
  chatMessage: (id: string, text: string) =>
    req(`/api/sessions/${id}/chat/message`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  chatApproval: (id: string, approvalId: string, decision: "allow" | "always" | "deny") =>
    req(`/api/sessions/${id}/chat/approval`, {
      method: "POST",
      body: JSON.stringify({ id: approvalId, decision }),
    }),
  chatInterrupt: (id: string) =>
    req(`/api/sessions/${id}/chat/interrupt`, { method: "POST" }),
  chatModel: (id: string, model: string | null) =>
    req(`/api/sessions/${id}/chat/model`, {
      method: "POST",
      body: JSON.stringify({ model }),
    }),
  gitOp: (
    id: string,
    body: { op: string; message?: string; branch?: string; sha?: string },
  ) =>
    req<{ output: string }>(`/api/sessions/${id}/git`, {
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
