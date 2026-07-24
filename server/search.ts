import fs from "node:fs";
import path from "node:path";
import type { GrottoConfig } from "./config.js";

/**
 * Transcript search — the ⌘K "search this session" surface. Reads the durable
 * chat event log agent.ts appends (`$GROTTO_HOME/chat/<id>.jsonl`) straight
 * from disk, so it works whether or not the chat is currently connected. Pure
 * substring match (case-insensitive), newest-first, bounded.
 */

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SCAN_CAP = 5000; // most-recent lines scanned — bounds a long-running session
const SNIPPET = 160; // chars of context around the match

export interface SearchHit {
  seq: number;
  at: number;
  kind: string;
  /** which side of the conversation this line is */
  role: "user" | "agent" | "tool" | "approval" | "system";
  snippet: string;
}

interface RawEvent {
  seq?: number;
  at?: number;
  kind?: string;
  text?: unknown;
  summary?: unknown;
  name?: unknown;
  title?: unknown;
  message?: unknown;
  output?: unknown;
}

/** The human-readable text of one event, and who "said" it. */
function fieldsFor(ev: RawEvent): { role: SearchHit["role"]; text: string } {
  switch (ev.kind) {
    case "user":
      return { role: "user", text: str(ev.text) };
    case "text":
      return { role: "agent", text: str(ev.text) };
    case "tool":
      return { role: "tool", text: `${str(ev.name)} ${str(ev.summary)}`.trim() };
    case "tool_done":
      return { role: "tool", text: str(ev.output) };
    case "approval":
      return { role: "approval", text: str(ev.title) };
    case "error":
      return { role: "system", text: str(ev.message) };
    default:
      return { role: "system", text: "" };
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Build a snippet centred on the first match of `q` (already lower-cased). */
function snippetAround(text: string, qLower: string): string {
  const idx = text.toLowerCase().indexOf(qLower);
  if (idx < 0) return text.slice(0, SNIPPET);
  const start = Math.max(0, idx - SNIPPET / 2);
  const end = Math.min(text.length, idx + qLower.length + SNIPPET / 2);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

export function searchTranscript(
  cfg: GrottoConfig,
  sessionId: string,
  query: string,
  limit = 50,
): SearchHit[] {
  const q = query.trim();
  if (!q || !SAFE_ID.test(sessionId)) return [];
  const qLower = q.toLowerCase();
  const file = path.join(cfg.home, "chat", `${sessionId}.jsonl`);

  let lines: string[];
  try {
    lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  // Scan newest-first so recent hits win and we can stop at `limit`.
  const hits: SearchHit[] = [];
  const scan = lines.slice(-SCAN_CAP);
  for (let i = scan.length - 1; i >= 0 && hits.length < limit; i--) {
    let ev: RawEvent;
    try {
      ev = JSON.parse(scan[i]) as RawEvent;
    } catch {
      continue;
    }
    const { role, text } = fieldsFor(ev);
    if (!text || !text.toLowerCase().includes(qLower)) continue;
    hits.push({
      seq: typeof ev.seq === "number" ? ev.seq : 0,
      at: typeof ev.at === "number" ? ev.at : 0,
      kind: str(ev.kind) || "text",
      role,
      snippet: snippetAround(text, qLower),
    });
  }
  return hits;
}
