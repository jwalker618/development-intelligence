import fs from "node:fs";
import path from "node:path";
import {
  query,
  type EffortLevel,
  type ModelInfo,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { WebSocket } from "ws";
import { cavemanStatus } from "./caveman.js";
import { sessionEnv, type GrottoConfig } from "./config.js";
import { UsageLedger, turnFromResult } from "./usage.js";

// ── Native agent chat ───────────────────────────────────────────────────────
// The phone never sees Claude Code's full-screen TUI again: the server drives
// Claude Code HEADLESSLY through the official Agent SDK, and the client gets
// a structured event stream it renders as a native chat — bubbles, tool
// cards, real Approve/Deny buttons. Auth is the injected subscription token
// (no login screens), and caveman + RTK still apply because the SDK loads the
// same user settings/hooks from CLAUDE_CONFIG_DIR (settingSources below).

export type ChatEventKind =
  | "init" // claude session started {model}
  | "user" // user message {text}
  | "text" // assistant text block {text}
  | "tool" // tool call {toolUseId, name, summary, input}
  | "tool_done" // tool result {toolUseId, ok, output}
  | "approval" // permission ask {id, title, displayName, toolName, input}
  | "approval_done" // {id, decision}
  | "result" // turn finished {ok, costUsd, durationMs}
  | "error"; // {message}

/** 'stop' denies AND interrupts the turn; 'allow' may carry an edited input. */
export type ApprovalDecision = "allow" | "always" | "deny" | "stop";

export interface ChatEvent {
  seq: number;
  at: number;
  kind: ChatEventKind;
  [k: string]: unknown;
}

interface ChatMeta {
  claudeSessionId?: string;
  model?: string;
  effort?: EffortLevel;
}

const HISTORY_LIMIT = 800; // events replayed to a connecting client
const OUTPUT_CAP = 6000; // chars of tool output persisted per event

function summarize(name: string, input: Record<string, unknown>): string {
  const s =
    input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url ?? input.query;
  if (typeof s === "string") return s.length > 120 ? s.slice(0, 117) + "…" : s;
  if (name === "TodoWrite") return "update plan";
  return "";
}

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : ""))
      .join("\n");
  }
  return "";
}

/** The slice of a Session the agent needs. Structural, so a Session satisfies
 *  it directly and `extraDirs` stays LIVE — adding a repo mid-session changes
 *  what the next query sees without re-registering the chat. */
export interface Workspace {
  readonly id: string;
  /** Primary checkout — the agent's cwd. */
  readonly dir: string;
  /** Secondary checkouts, handed to the SDK as additionalDirectories. */
  readonly extraDirs: string[];
}

/** One headless Claude Code conversation, bound to a session workspace. */
export class AgentChat {
  private events: ChatEvent[] = [];
  private seq = 0;
  private clients = new Set<WebSocket>();
  private q: Query | null = null;
  private inputWaiters: Array<(m: SDKUserMessage) => void> = [];
  private inputBacklog: SDKUserMessage[] = [];
  private pending: {
    id: string;
    resolve: (r: PermissionResult) => void;
    input: Record<string, unknown>;
    toolName: string;
    suggestions?: PermissionUpdate[];
  } | null = null;
  private meta: ChatMeta = {};
  private busy = false;
  /** Model the CLI resolved for the current run. NOT persisted: writing it into
   *  meta permanently version-pins a session the user never configured, so a
   *  "Default" session would silently stick to whatever was newest that day. */
  private active: string | null = null;

  private ledger: UsageLedger;

  constructor(
    private cfg: GrottoConfig,
    private ws: Workspace,
  ) {
    this.ledger = new UsageLedger(cfg);
    fs.mkdirSync(this.chatDir, { recursive: true });
    this.load();
  }

  private get chatDir(): string {
    return path.join(this.cfg.home, "chat");
  }
  private get logPath(): string {
    return path.join(this.chatDir, `${this.ws.id}.jsonl`);
  }
  private get metaPath(): string {
    return path.join(this.chatDir, `${this.ws.id}.meta.json`);
  }

  private load(): void {
    try {
      const lines = fs.readFileSync(this.logPath, "utf8").split("\n").filter(Boolean);
      this.events = lines.slice(-HISTORY_LIMIT).map((l) => JSON.parse(l) as ChatEvent);
      this.seq = this.events.at(-1)?.seq ?? 0;
    } catch {
      this.events = [];
    }
    try {
      this.meta = JSON.parse(fs.readFileSync(this.metaPath, "utf8")) as ChatMeta;
    } catch {
      this.meta = {};
    }
  }

  private saveMeta(): void {
    try {
      fs.writeFileSync(this.metaPath, JSON.stringify(this.meta), { mode: 0o600 });
    } catch {
      /* chat still works without resume */
    }
  }

  /** Persist + broadcast a durable event. */
  private emit(kind: ChatEventKind, fields: Record<string, unknown>): ChatEvent {
    const ev: ChatEvent = { seq: ++this.seq, at: Date.now(), kind, ...fields };
    this.events.push(ev);
    if (this.events.length > HISTORY_LIMIT) this.events.shift();
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(ev) + "\n");
    } catch {
      /* history loss only */
    }
    this.broadcast({ t: "event", event: ev });
    return ev;
  }

  /** Broadcast an ephemeral frame (deltas, status) — not persisted. */
  private broadcast(frame: Record<string, unknown>): void {
    const raw = JSON.stringify(frame);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(raw);
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.broadcast({ t: "status", busy });
  }

  private lastApprovalEvent(): ChatEvent | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.kind === "approval" && e.id === this.pending?.id) return e;
    }
    return null;
  }

  attach(ws: WebSocket): void {
    this.clients.add(ws);
    ws.send(
      JSON.stringify({
        t: "hello",
        events: this.events,
        busy: this.busy,
        model: this.meta.model ?? null,
        activeModel: this.active,
        effort: this.meta.effort ?? null,
        pendingApproval: this.pending ? this.lastApprovalEvent() : null,
      }),
    );
    ws.on("close", () => this.clients.delete(ws));
  }

  get pendingApprovalTitle(): string | null {
    if (!this.pending) return null;
    const ev = this.lastApprovalEvent();
    return (ev?.title as string) ?? this.pending.toolName;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get model(): string | null {
    return this.meta.model ?? null;
  }

  /** The model the CLI actually resolved for this session (may differ from the
   *  user's choice, e.g. when they left it on Default). */
  get activeModel(): string | null {
    return this.active;
  }

  /** Live catalog off the running query — free, it reuses the cached init
   *  result. Null when no conversation is running. */
  supportedModels(): Promise<ModelInfo[]> | null {
    return this.q ? this.q.supportedModels() : null;
  }

  send(text: string): void {
    this.emit("user", { text });
    const msg: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
      parent_tool_use_id: null,
    };
    this.ensureRunning();
    const waiter = this.inputWaiters.shift();
    if (waiter) waiter(msg);
    else this.inputBacklog.push(msg);
  }

  usage(): ReturnType<UsageLedger["summarize"]> {
    return this.ledger.summarize(this.ws.id);
  }

  get effort(): EffortLevel | null {
    return this.meta.effort ?? null;
  }

  async setModel(model: string | null): Promise<void> {
    this.meta.model = model ?? undefined;
    this.saveMeta();
    if (this.q) await this.q.setModel(model ?? undefined).catch(() => undefined);
    this.broadcast({ t: "model", model });
  }

  /** Reasoning effort. The SDK has no live setter (creation-time option), so we
   *  recycle an idle query — the next turn resumes the same conversation with
   *  the new effort. A busy query keeps its effort until the current turn ends. */
  async setEffort(effort: EffortLevel | null): Promise<void> {
    this.meta.effort = effort ?? undefined;
    this.saveMeta();
    await this.recycle();
    this.broadcast({ t: "effort", effort });
  }

  /** Drop an IDLE query so the next turn rebuilds it with current creation-time
   *  options (effort, additionalDirectories). Resume keeps the conversation, so
   *  this is invisible to the user. A busy query is left alone — recycling
   *  mid-turn would lose the in-flight reply. */
  async recycle(): Promise<void> {
    if (!this.q || this.busy) return;
    const q = this.q;
    this.q = null;
    // interrupt() ends the TURN; close() ends the PROCESS. Without the close
    // every recycle leaked a Claude CLI subprocess for the container's lifetime.
    await q.interrupt().catch(() => undefined);
    try { await q.close?.(); } catch { /* already gone */ }
  }

  async interrupt(): Promise<void> {
    // An unanswered permission ask holds the turn open — release it first.
    this.resolveApproval(this.pending?.id ?? "", "deny");
    if (this.q) await this.q.interrupt().catch(() => undefined);
    this.setBusy(false);
  }

  resolveApproval(
    id: string,
    decision: ApprovalDecision,
    editedInput?: Record<string, unknown>,
  ): boolean {
    const p = this.pending;
    if (!p || p.id !== id) return false;
    this.pending = null;
    const edited = decision === "allow" && editedInput ? editedInput : undefined;
    this.emit("approval_done", { id, decision, edited: !!edited });
    if (decision === "deny" || decision === "stop") {
      p.resolve({
        behavior: "deny",
        message: decision === "stop" ? "Denied — stop this turn." : "Denied from Grotto.",
        // 'stop' ends the whole turn instead of letting the agent try again.
        ...(decision === "stop" ? { interrupt: true } : {}),
      });
    } else {
      p.resolve({
        behavior: "allow",
        // updatedInput is how a reviewer FIXES a bad argument (e.g. a wrong rm
        // path) instead of denying and re-prompting in prose.
        updatedInput: edited ?? p.input,
        ...(decision === "always" && p.suggestions?.length
          ? { updatedPermissions: p.suggestions }
          : {}),
      });
    }
    this.broadcast({ t: "approval_cleared", id });
    return true;
  }

  destroy(): void {
    void this.interrupt();
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    fs.rmSync(this.logPath, { force: true });
    fs.rmSync(this.metaPath, { force: true });
  }

  // ── SDK loop ──────────────────────────────────────────────────────────────

  private nextInput(): Promise<SDKUserMessage> {
    const queued = this.inputBacklog.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => this.inputWaiters.push(resolve));
  }

  private ensureRunning(): void {
    if (this.q) return;

    const self = this;
    async function* inputs(): AsyncIterable<SDKUserMessage> {
      for (;;) yield await self.nextInput();
    }

    const env: Record<string, string | undefined> = { ...sessionEnv(this.cfg) };

    const q = query({
      prompt: inputs(),
      options: {
        cwd: this.ws.dir,
        // Multi-repo: the agent can read and edit every checkout in the session,
        // not just its cwd. Snapshotted at query build — see recycle().
        ...(this.ws.extraDirs.length ? { additionalDirectories: [...this.ws.extraDirs] } : {}),
        env,
        resume: this.meta.claudeSessionId,
        model: this.meta.model,
        ...(this.meta.effort ? { effort: this.meta.effort } : {}),
        // Load the user's CLAUDE_CONFIG_DIR settings + the repo's CLAUDE.md —
        // this is what keeps caveman hooks and RTK in the loop headlessly.
        settingSources: ["user", "project"],
        // Hook events let us show whether caveman / RTK actually fired for a
        // turn — a real liveness signal instead of assuming they are working.
        includeHookEvents: true,
        includePartialMessages: true,
        permissionMode: "default",
        canUseTool: async (toolName, input, opts) => {
          // One ask at a time (matches Claude Code's own serial prompts).
          const result = new Promise<PermissionResult>((resolve) => {
            this.pending = {
              id: opts.requestId,
              resolve,
              input,
              toolName,
              suggestions: opts.suggestions,
            };
          });
          // Surface the FULL context the SDK gives us. Previously we kept only
          // title/displayName, so the reviewer had to infer blast radius from a
          // raw input blob.
          this.emit("approval", {
            id: opts.requestId,
            toolName,
            title: opts.title ?? `Claude wants to use ${toolName}`,
            displayName: opts.displayName ?? toolName,
            description: opts.description ?? null,   // blast radius, in prose
            blockedPath: opts.blockedPath ?? null,   // the path that tripped it
            decisionReason: opts.decisionReason ?? null, // WHY it was asked
            agentID: opts.agentID ?? null,           // non-null => a subagent
            toolUseId: opts.toolUseID ?? null,
            canAlways: !!opts.suggestions?.length,
            input,
          });
          opts.signal.addEventListener("abort", () => {
            if (this.pending?.id === opts.requestId) {
              this.pending = null;
              this.broadcast({ t: "approval_cleared", id: opts.requestId });
            }
          });
          return result;
        },
      },
    });
    this.q = q;

    void (async () => {
      try {
        for await (const msg of q) {
          switch (msg.type) {
            case "system":
              if (msg.subtype === "init") {
                this.meta.claudeSessionId = msg.session_id;
                this.active = msg.model;
                this.saveMeta();
                this.emit("init", { model: msg.model });
                this.setBusy(true);
              }
              break;
            case "stream_event": {
              const ev = msg.event as {
                type: string;
                delta?: { type?: string; text?: string };
              };
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                this.broadcast({ t: "delta", text: ev.delta.text ?? "" });
              }
              break;
            }
            case "assistant": {
              this.setBusy(true);
              for (const block of msg.message.content) {
                if (block.type === "text" && block.text.trim()) {
                  this.emit("text", { text: block.text });
                } else if (block.type === "tool_use") {
                  this.emit("tool", {
                    toolUseId: block.id,
                    name: block.name,
                    summary: summarize(block.name, block.input as Record<string, unknown>),
                    input: JSON.stringify(block.input).slice(0, OUTPUT_CAP),
                  });
                }
              }
              break;
            }
            case "user": {
              const content = msg.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "tool_result") {
                    this.emit("tool_done", {
                      toolUseId: block.tool_use_id,
                      ok: !block.is_error,
                      output: blockText(block.content).slice(0, OUTPUT_CAP),
                    });
                  }
                }
              }
              break;
            }
            case "result": {
              // Real per-turn usage, tagged with the caveman mode that was
              // active — this is what replaces the invented efficiency numbers.
              const mode = cavemanStatus(this.cfg.claudeConfigDir).mode ?? "off";
              const turn = turnFromResult(
                msg as unknown as Record<string, unknown>,
                mode,
                this.active ?? this.meta.model ?? null,
              );
              this.ledger.record(this.ws.id, turn);
              this.emit("result", {
                ok: msg.subtype === "success",
                costUsd: "total_cost_usd" in msg ? msg.total_cost_usd : null,
                durationMs: msg.duration_ms,
                inputTokens: turn.inputTokens,
                outputTokens: turn.outputTokens,
                cacheReadTokens: turn.cacheReadTokens,
                mode,
              });
              this.broadcast({ t: "usage", summary: this.ledger.summarize(this.ws.id) });
              this.setBusy(false);
              break;
            }
            default:
              break;
          }
        }
      } catch (e) {
        this.emit("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (this.q === q) this.q = null;
        this.setBusy(false);
      }
    })();
  }
}

/** Chats keyed by Grotto session id, created lazily, destroyed with the session. */
export class AgentChats {
  private chats = new Map<string, AgentChat>();

  constructor(private cfg: GrottoConfig) {}

  get(ws: Workspace): AgentChat {
    let chat = this.chats.get(ws.id);
    if (!chat) {
      chat = new AgentChat(this.cfg, ws);
      this.chats.set(ws.id, chat);
    }
    return chat;
  }

  peek(sessionId: string): AgentChat | null {
    return this.chats.get(sessionId) ?? null;
  }

  destroy(sessionId: string): void {
    this.chats.get(sessionId)?.destroy();
    this.chats.delete(sessionId);
  }
}
