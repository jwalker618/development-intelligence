/* Development Intelligence — the control-plane data layer.
 *
 * Thin mapping layer over src/api.ts (the existing, correct client): it turns
 * the server's shapes into the DI view-model (state.ts) the screens render, and
 * exposes the actions the screens call. Anything the control plane does NOT yet
 * back — RTK savings %, the semantic span-diff engine, pins, tasks, the preview
 * runtime bridge — is flagged in `SAMPLE` and stays on seed data (honest until
 * those endpoints exist; see the design handoff §9 open questions). */

import { api, chatUrl, getToken, type CavemanStatus, type GitStatus, type SpanDiffResponse } from "../api";
import type {
  CavemanMode, Change, DiffLine, Hunk, Pin, SessionState, TimelineTick,
} from "./state";
import { seedState } from "./state";

// ── which surfaces are live vs. sample (drives the "sample" chips in the UI) ──
export const SAMPLE = {
  rtk: true,            // no RTK endpoint yet
  cavemanPercent: true, // server gives a lifetime savings string, not a per-session %
  semanticDiff: false,  // live: token-level span diff + LCS move detection (server/spandiff.ts)
  pins: false,          // live: per-session pin store (server/pins.ts)
  tasks: true,          // no task-runner backend yet (§9.3)
  preview: true,        // no preview runtime bridge yet (§9.4)
} as const;

// ── caveman ──────────────────────────────────────────────────────────────────

const DIAL: CavemanMode[] = ["off", "lite", "full", "ultra"];

/** The verbosity dial's write side. src/api.ts has only the GET, so POST here
 *  (same auth/error contract). A 401 surfaces via the thrown "HTTP 401". */
export async function setCavemanMode(mode: string | null): Promise<CavemanStatus> {
  const res = await fetch("/api/caveman", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ mode }),
  });
  const data = (await res.json().catch(() => ({}))) as CavemanStatus & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Server mode (null | lite | full | ultra | wenyan-*) → the 4-stop dial. */
export function toDialMode(mode: string | null): CavemanMode {
  if (!mode) return "off";
  const base = mode.replace(/^wenyan-?/, "") || "full";
  return (DIAL as string[]).includes(base) ? (base as CavemanMode) : "full";
}

/** Pull a rough number out of the lifetime savings suffix ("⛏ 12.4k" → 12.4). */
export function savingsNumber(savings: string | null): number {
  if (!savings) return 0;
  const m = savings.match(/([\d.]+)\s*k/i);
  if (m) return Math.round(Number(m[1]));
  const n = savings.match(/(\d+)/);
  return n ? Number(n[1]) : 0;
}

// ── git status → the Changes list ─────────────────────────────────────────────

function mapStatus(xy: string): Change["status"] {
  const c = xy.replace(/\s/g, "")[0] ?? "M";
  if (c === "?" || c === "A") return "A";
  if (c === "D") return "D";
  return "M";
}

export function toChanges(
  git: GitStatus,
  reviewed: Set<string>,
  approvalTitle: string | null,
): Change[] {
  const files: Change[] = git.entries.map((e) => ({
    path: e.path,
    status: mapStatus(e.status),
    needsYou: false,
    reviewed: reviewed.has(e.path),
    add: 0,
    del: 0,
    kind: "file",
  }));
  // A pending native approval surfaces as the design's "Needs you" row.
  if (approvalTitle) {
    files.unshift({
      path: approvalTitle, status: "M", needsYou: true, reviewed: false, add: 0, del: 0, kind: "approval",
    });
  }
  return files;
}

// ── git log → the timeline ─────────────────────────────────────────────────────

export function toTimeline(entries: Array<{ sha: string; subject: string; when: string }>): TimelineTick[] {
  const ticks: TimelineTick[] = [{ at: "now", label: "now — reviewing", kind: "now" }];
  for (const e of entries.slice(0, 6)) {
    ticks.push({ at: e.when, label: e.subject, kind: "merged" });
  }
  return ticks;
}

// ── unified diff → hunks (LINE diff; no spans/moves — engine not wired) ────────

export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(/\+(\d+)/);
      newNo = m ? Number(m[1]) : 0;
      cur = { header: raw.replace(/@@\s*$/, "").trim(), lines: [], verdict: null };
      hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ") ||
        raw.startsWith("index ") || raw.startsWith("new file") || raw.startsWith("deleted file")) continue;
    if (raw.startsWith("+")) {
      cur.lines.push({ no: newNo++, kind: "add", text: raw.slice(1) } as DiffLine);
    } else if (raw.startsWith("-")) {
      cur.lines.push({ no: null, kind: "del", text: raw.slice(1) } as DiffLine);
    } else {
      cur.lines.push({ no: newNo++, kind: "context", text: raw.slice(1) } as DiffLine);
    }
  }
  // Cap each hunk so a giant diff can't blow the panel.
  for (const h of hunks) if (h.lines.length > 60) h.lines = h.lines.slice(0, 60);
  return hunks;
}

// ── semantic span diff (server/spandiff.ts) → hunks + move blocks ─────────────

/** A run of lines moved (deleted here, re-inserted unchanged elsewhere). */
export interface Move { count: number; text: string; toLine: number }

/** Map the server SpanDiff into the client Hunk[] + moves the review hero renders. */
export function mapSpanDiff(res: SpanDiffResponse): { hunks: Hunk[]; moves: Move[]; truncated: boolean; binary: boolean } {
  if (res.binary) return { hunks: [], moves: [], truncated: false, binary: true };
  const hunks: Hunk[] = (res.hunks ?? []).map((h) => ({
    header: h.header,
    verdict: null,
    lines: h.lines.map((l): DiffLine => {
      if (l.kind === "replace") {
        return {
          no: l.no,
          kind: "replace",
          ops: (l.ops ?? []).map((op) =>
            op.kind === "delete" ? { kind: "delete" as const, oldText: op.text }
              : op.kind === "insert" ? { kind: "insert" as const, newText: op.text }
                : { kind: "equal" as const, text: op.text }),
        };
      }
      return { no: l.no, kind: l.kind, text: l.text };
    }),
  }));
  // Cap each hunk so a giant diff can't blow the panel (parity with parseDiff).
  for (const h of hunks) if (h.lines.length > 60) h.lines = h.lines.slice(0, 60);
  return { hunks, moves: res.moves ?? [], truncated: !!res.truncated, binary: false };
}

// ── flat path list → a nested file tree ────────────────────────────────────────

export interface TreeNode { name: string; path: string; kind: "dir" | "file"; depth: number; children: TreeNode[]; }

export function buildTree(paths: string[], repo: string): TreeNode {
  const root: TreeNode = { name: repo.split("/").pop() || "repo", path: "", kind: "dir", depth: 0, children: [] };
  for (const p of paths.slice(0, 800)) {
    const parts = p.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), kind: isFile ? "file" : "dir", depth: i + 1, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

// ── chat: fold the WS event stream into renderable messages ────────────────────

export interface ChatMsg {
  id: string;
  role: "user" | "agent" | "tool" | "approval";
  text: string;
  file?: string;
  addDel?: string;
  approvalId?: string;
  /** Built from streaming deltas; the durable `text` event replaces it rather
   *  than appending a second identical bubble. */
  streaming?: boolean;
}

export interface ChatState {
  messages: ChatMsg[];
  busy: boolean;
  model: string | null;
  /** What the CLI actually resolved (differs from `model` when on Default). */
  activeModel: string | null;
  effort: string | null;
  pendingApprovalId: string | null;
}

interface ChatEvent { seq?: number; kind?: string; [k: string]: unknown; }

function foldEvent(msgs: ChatMsg[], ev: ChatEvent): ChatMsg[] {
  const id = String(ev.seq ?? msgs.length);
  switch (ev.kind) {
    case "user":
      return [...msgs, { id, role: "user", text: String(ev.text ?? "") }];
    case "text":
      return [...msgs, { id, role: "agent", text: String(ev.text ?? "") }];
    case "tool":
      return [...msgs, { id, role: "tool", text: String(ev.name ?? "tool"), file: ev.file as string | undefined }];
    case "approval":
      return [...msgs, { id, role: "approval", text: String(ev.title ?? "Approval required"), approvalId: String(ev.id ?? "") }];
    default:
      return msgs;
  }
}

export function foldHello(events: ChatEvent[]): ChatMsg[] {
  return events.reduce(foldEvent, [] as ChatMsg[]);
}

/** Subscribe to a session's chat WS. Returns an unsubscribe fn.
 *  Reconnects with backoff; onReauth fires on an auth-failure close. */
export function subscribeChat(
  sessionId: string,
  handlers: {
    onState: (patch: Partial<ChatState>) => void;
    onEvent: (ev: ChatEvent) => void;
    onDelta: (text: string) => void;
    onConn: (c: "connecting" | "live" | "offline") => void;
  },
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1000;

  const connect = () => {
    if (closed) return;
    handlers.onConn("connecting");
    ws = new WebSocket(chatUrl(sessionId));
    ws.onopen = () => { backoff = 1000; handlers.onConn("live"); };
    ws.onmessage = (e) => {
      let f: Record<string, unknown>;
      try { f = JSON.parse(e.data as string); } catch { return; }
      if (f.t === "hello") {
        handlers.onState({
          messages: foldHello((f.events as ChatEvent[]) ?? []),
          busy: !!f.busy,
          model: (f.model as string) ?? null,
          activeModel: (f.activeModel as string) ?? null,
          effort: (f.effort as string) ?? null,
          pendingApprovalId: f.pendingApproval ? String((f.pendingApproval as ChatEvent).id ?? "") : null,
        });
      } else if (f.t === "event") {
        handlers.onEvent(f.event as ChatEvent);
      } else if (f.t === "delta") {
        handlers.onDelta(String(f.text ?? ""));
      } else if (f.t === "status") {
        handlers.onState({ busy: !!f.busy });
      } else if (f.t === "model") {
        handlers.onState({ model: (f.model as string) ?? null });
      } else if (f.t === "effort") {
        handlers.onState({ effort: (f.effort as string) ?? null });
      } else if (f.t === "approval_cleared") {
        handlers.onState({ pendingApprovalId: null });
      }
    };
    ws.onclose = () => {
      if (closed) return;
      handlers.onConn("offline");
      backoff = Math.min(backoff * 2, 15000);
      setTimeout(connect, backoff);
    };
    ws.onerror = () => ws?.close();
  };
  connect();
  return () => { closed = true; ws?.close(); };
}

// ── the seed view-model, for sample-backed slices ──────────────────────────────
export { seedState };
export { api };
