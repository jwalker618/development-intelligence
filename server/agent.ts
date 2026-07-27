import fs from "node:fs";
import path from "node:path";
import {
  query,
  type EffortLevel,
  type ModelInfo,
  type PermissionResult,
  type PermissionMode,
  type PermissionUpdate,
  type Query,
  type SDKSystemMessage,
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
  | "denied" // auto-denied without asking us {toolName, why, message}
  | "notice" // banner from the loop: hook block reason, status line {text, level}
  | "compacted" // context was compacted {trigger, preTokens, postTokens}
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
  /** How long the agent's leash is. Persisted so a reconnect doesn't quietly
   *  hand a pocketed phone a different posture than the one it was left in. */
  permissionMode?: PermissionMode;
  /** Structural read-only posture — see `disallowedTools`. */
  denyTools?: string[];
  /** Runaway-loop brake, orthogonal to cost. Unset by default. */
  maxTurns?: number;
  /** Hard spend ceiling in USD. The one control that makes an unattended
   *  phone-away run defensible. Meaningless on subscription auth — see
   *  `costsAreReal` before showing it. */
  budgetUsd?: number;
}

/** The permission modes DI offers. `bypassPermissions` is deliberately absent:
 *  a review-first IDE has no legitimate use for a mode that removes the human,
 *  and the session is locked out of it via `disableBypassPermissionsMode`. */
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "dontAsk"] as const;
export type DiPermissionMode = (typeof PERMISSION_MODES)[number];

/** Tools that cannot change anything. Auto-approved so the reviewer is
 *  interrupted only for state changes; each still renders a tool card. */
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "NotebookRead", "TodoWrite"];

/** Everything that can mutate the workspace or the outside world. A session
 *  opened read-only is STRUCTURALLY incapable of these, not merely told not to. */
export const MUTATING_TOOLS = ["Write", "Edit", "NotebookEdit", "Bash", "BashOutput", "KillShell"];

const PLAN_INSTRUCTIONS =
  "Write the plan as at most 7 numbered steps. Name every file you will create, " +
  "edit or delete, with its path. State anything you are unsure about as an open " +
  "question rather than assuming. Do not write code in the plan.";

const HISTORY_LIMIT = 800; // events replayed to a connecting client
const OUTPUT_CAP = 6000; // chars of tool output persisted per event
const HOOK_RUNS = 40; // hook results retained for the liveness chip
const STDERR_LINES = 200; // CLI stderr retained for Diagnostics

/** Where a turn lands when the chosen model is unavailable. Cheap and always
 *  present, so a long unattended run degrades rather than dying. */
const FALLBACK_MODEL = "claude-sonnet-4-5";

/** What the CLI told us about ITSELF at init — inventories the UI would
 *  otherwise have to hardcode. Free: it all arrives on a message we already
 *  receive. Everything here is CLI-authored, so it is display-only. */
export interface SessionSignals {
  commands: string[];
  skills: string[];
  agents: string[];
  tools: string[];
  plugins: Array<{ name: string; version?: string }>;
  mcpServers: Array<{ name: string; status: string }>;
  betas: string[];
  outputStyle: string | null;
  permissionMode: string | null;
  apiKeySource: string | null;
  cliVersion: string | null;
}

/** One settings-file hook execution. The honest answer to "did caveman fire on
 *  this turn?" — a boolean per run, never a synthesised percentage. */
export interface HookRun {
  at: number;
  name: string;
  event: string;
  outcome: "success" | "error" | "cancelled";
  exitCode: number | null;
}

const emptySignals = (): SessionSignals => ({
  commands: [], skills: [], agents: [], tools: [], plugins: [], mcpServers: [],
  betas: [], outputStyle: null, permissionMode: null, apiKeySource: null, cliVersion: null,
});

function summarize(name: string, input: Record<string, unknown>): string {
  const s =
    input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url ?? input.query;
  if (typeof s === "string") return s.length > 120 ? s.slice(0, 117) + "…" : s;
  if (name === "TodoWrite") return "update plan";
  return "";
}

/**
 * The model that did most of the work this turn, from `modelUsage`. This is
 * how a `fallbackModel` substitution becomes visible: we read what ran rather
 * than assuming the requested model ran. Returns null when the SDK gave us no
 * per-model breakdown.
 */
function dominantModel(msg: Record<string, unknown>): string | null {
  const usage = msg.modelUsage;
  if (!usage || typeof usage !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  let best: string | null = null;
  let bestOut = -1;
  for (const [model, u] of Object.entries(usage as Record<string, unknown>)) {
    const o = (u ?? {}) as Record<string, unknown>;
    // Rank on OUTPUT only. Input and cache-read are dominated by whichever
    // model happened to carry the big cached prefix — measured live, that made
    // a background haiku call outrank the model that actually wrote the reply.
    const out = n(o.outputTokens);
    if (out > bestOut) { bestOut = out; best = model; }
  }
  return best;
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
  /**
   * Input queue, generation-tagged.
   *
   * The prompt generator lives inside the query, but the queue it pulls from
   * lives on the chat. When a query is recycled the OLD generator is still
   * parked on `nextInput()` holding a waiter — so the next message was handed
   * to a process that had already been closed, and the turn silently hung.
   * Bumping `epoch` retires those waiters with `null`, which ends the old
   * generator cleanly and lets the live one take the message.
   */
  private epoch = 0;
  private inputWaiters: Array<(m: SDKUserMessage | null) => void> = [];
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
  /** CLI-reported inventories, refreshed on every init. */
  private signals: SessionSignals = emptySignals();
  /** Bounded ring of settings-file hook results — caveman/RTK liveness. */
  private hookRuns: HookRun[] = [];
  /** The CLI's own idea of what it is doing. When present it OUTRANKS our
   *  inference: six inference sites is how stuck spinners happen. */
  private cliState: "idle" | "running" | "requires_action" | null = null;
  /** Bounded ring of CLI stderr lines, for Settings → Diagnostics. */
  private stderrRing: string[] = [];
  /** Last plan rate-limit push. Subscription auth only; null elsewhere. */
  private rateLimit: Record<string, unknown> | null = null;
  /** Cached account identity — one control request per query lifetime. */
  private accountCache: Record<string, unknown> | null = null;

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
    if (this.busy === busy) return;
    this.busy = busy;
    this.broadcast({ t: "status", busy });
  }

  /** Busy inferred from the message stream. Ignored once the CLI has told us
   *  its own state — mixing the two is what produced stuck spinners. */
  private inferBusy(busy: boolean): void {
    if (this.cliState === null) this.setBusy(busy);
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
        signals: this.signals,
        hooks: this.hookRuns,
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
    // Retire the parked waiter FIRST: leaving it attached to the closing query
    // is what made the next message vanish into a dead subprocess.
    this.epoch++;
    this.retireInputs();
    // interrupt() ends the TURN; close() ends the PROCESS. Without the close
    // every recycle leaked a Claude CLI subprocess for the container's lifetime.
    await q.interrupt().catch(() => undefined);
    try { await q.close?.(); } catch { /* already gone */ }
  }

  get permissionMode(): DiPermissionMode {
    return (this.meta.permissionMode as DiPermissionMode | undefined) ?? "default";
  }

  /** True when the session was opened (or switched) to read-only review. */
  get readOnly(): boolean {
    return !!this.meta.denyTools?.length;
  }

  /**
   * Change the leash mid-session. The SDK has a live setter for this, so unlike
   * effort it does not need a query recycle — the very next tool call obeys.
   */
  async setPermissionMode(mode: DiPermissionMode): Promise<void> {
    this.meta.permissionMode = mode;
    this.saveMeta();
    if (this.q) await this.q.setPermissionMode(mode).catch(() => undefined);
    this.broadcast({ t: "permissionMode", mode });
  }

  /**
   * Read-only posture. `disallowedTools` is subtractive and has no
   * skill-compatibility hazard, unlike restricting `tools` wholesale (which
   * would remove tools the settings-loaded caveman/RTK skills assume exist).
   * Creation-time only, so an idle query is recycled to apply it.
   */
  async setReadOnly(on: boolean): Promise<void> {
    this.meta.denyTools = on ? [...MUTATING_TOOLS] : undefined;
    this.saveMeta();
    await this.recycle();
    this.broadcast({ t: "readOnly", readOnly: on });
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

  /** Resolves `null` once `epoch` is superseded, ending that generator. */
  private nextInput(epoch: number): Promise<SDKUserMessage | null> {
    if (epoch !== this.epoch) return Promise.resolve(null);
    const queued = this.inputBacklog.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => this.inputWaiters.push(resolve));
  }

  /** Release every parked waiter so superseded generators can exit. Queued
   *  messages stay in the backlog and are picked up by the next query. */
  private retireInputs(): void {
    const waiters = this.inputWaiters;
    this.inputWaiters = [];
    for (const w of waiters) w(null);
  }

  /**
   * Every `type: "system"` subtype the CLI emits. We used to keep only `init`
   * and drop the rest on the floor, which meant a hook could block a turn, or
   * a tool could be auto-denied, and the phone would show a prompt that simply
   * appeared to do nothing.
   *
   * Transcript discipline: `emit()` appends to the JSONL that ⌘K indexes, so
   * only reviewer-relevant events go there. Hook stdout/stderr and inventories
   * go on `broadcast()` — live, unindexed, and never persisted.
   */
  private onSystem(msg: Record<string, unknown> & { subtype?: string }): void {
    switch (msg.subtype) {
      case "init": {
        const m = msg as unknown as SDKSystemMessage;
        this.meta.claudeSessionId = m.session_id;
        this.active = m.model;
        this.saveMeta();
        this.signals = {
          commands: m.slash_commands ?? [],
          skills: m.skills ?? [],
          agents: m.agents ?? [],
          tools: m.tools ?? [],
          plugins: (m.plugins ?? []).map((p) => ({ name: p.name, ...(p.version ? { version: p.version } : {}) })),
          mcpServers: m.mcp_servers ?? [],
          betas: m.betas ?? [],
          outputStyle: m.output_style ?? null,
          permissionMode: m.permissionMode ?? null,
          apiKeySource: m.apiKeySource ?? null,
          cliVersion: m.claude_code_version ?? null,
        };
        this.emit("init", { model: m.model });
        this.broadcast({ t: "signals", signals: this.signals });
        this.setBusy(true);
        break;
      }

      // The CLI's own state machine. Ground truth beats inference.
      case "session_state_changed": {
        const state = (msg as { state?: string }).state;
        if (state === "idle" || state === "running" || state === "requires_action") {
          this.cliState = state;
          this.setBusy(state !== "idle");
        }
        break;
      }

      // Denied by a rule / classifier / mode — canUseTool was never called, so
      // without this the agent just looks like it underperformed.
      case "permission_denied": {
        const d = msg as { tool_name?: string; decision_reason?: string; decision_reason_type?: string; message?: string };
        this.emit("denied", {
          toolName: d.tool_name ?? "tool",
          why: d.decision_reason ?? d.decision_reason_type ?? "blocked",
          message: (d.message ?? "").slice(0, 600),
        });
        break;
      }

      // Banners from the loop: hook block reasons, status lines, command output.
      case "informational": {
        const i = msg as { content?: string; level?: string; prevent_continuation?: boolean };
        const level = i.level ?? "info";
        const text = (i.content ?? "").slice(0, 1200);
        if (!text) break;
        // `info` is transcript-mode chatter; anything louder is something the
        // reviewer is meant to act on, so it earns a durable row.
        if (level === "info") this.broadcast({ t: "notice", text, level });
        else this.emit("notice", { text, level, stops: !!i.prevent_continuation });
        break;
      }

      // Settings-file hooks — this is how we can say caveman/RTK fired.
      case "hook_response": {
        const h = msg as { hook_name?: string; hook_event?: string; outcome?: string; exit_code?: number };
        const run: HookRun = {
          at: Date.now(),
          name: h.hook_name ?? "hook",
          event: h.hook_event ?? "",
          outcome: h.outcome === "error" || h.outcome === "cancelled" ? h.outcome : "success",
          exitCode: typeof h.exit_code === "number" ? h.exit_code : null,
        };
        this.hookRuns.push(run);
        if (this.hookRuns.length > HOOK_RUNS) this.hookRuns.shift();
        // Never emit(): hook stdout/stderr can carry anything the hook printed.
        this.broadcast({ t: "hook", run });
        break;
      }

      // Compaction silently changes what the agent remembers. Make it visible.
      case "compact_boundary": {
        const meta = (msg as { compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number } }).compact_metadata;
        this.emit("compacted", {
          trigger: meta?.trigger ?? "auto",
          preTokens: meta?.pre_tokens ?? null,
          postTokens: meta?.post_tokens ?? null,
        });
        break;
      }

      // A mid-session push of the command list (skills discovered as the agent
      // moves around). The docs are explicit: REPLACE, don't merge.
      case "commands_changed": {
        const cmds = (msg as { commands?: Array<{ name?: string } | string> }).commands;
        if (Array.isArray(cmds)) {
          this.signals.commands = cmds.map((c) => (typeof c === "string" ? c : c.name ?? "")).filter(Boolean);
          this.broadcast({ t: "signals", signals: this.signals });
        }
        break;
      }

      default:
        break;
    }
  }

  /** Live CLI inventories + hook liveness, for the client and the API. */
  status(): { signals: SessionSignals; hooks: HookRun[]; cliState: string | null } {
    return { signals: this.signals, hooks: this.hookRuns, cliState: this.cliState };
  }

  /**
   * Fill the inventories from a control request rather than waiting for the
   * `system/init` message.
   *
   * Measured, not assumed: the CLI does NOT emit `system/init` until the first
   * user message, so a freshly warmed session has empty inventories. This is
   * the only source for command/agent lists before turn one — which is exactly
   * when a new user is looking at the screen.
   */
  async hydrateSignals(): Promise<void> {
    if (!this.q) return;
    const init = await this.q.initializationResult().catch(() => null);
    if (!init) return;
    const named = (xs: unknown): string[] =>
      Array.isArray(xs)
        ? xs.map((x) => (typeof x === "string" ? x : String((x as { name?: string })?.name ?? ""))).filter(Boolean)
        : [];
    if (init.commands?.length) this.signals.commands = named(init.commands);
    if (init.agents?.length) this.signals.agents = named(init.agents);
    if (init.output_style) this.signals.outputStyle = init.output_style;
    if (init.account) this.accountCache = init.account as Record<string, unknown>;
    this.broadcast({ t: "signals", signals: this.signals });
  }

  /**
   * Start the CLI without sending a message.
   *
   * Every control request below — context meter, model catalog, account,
   * MCP status — has NO data source until a query exists. Without warming,
   * the meter is blank at exactly the moment a new user first looks at it.
   * Deliberately does not set busy: nothing is running yet.
   */
  warm(): void {
    this.ensureRunning();
  }

  /** Live context-window accounting: what the prompt is actually made of.
   *  Null when no query is running (call warm() first). */
  async contextUsage(): Promise<unknown | null> {
    if (!this.q) return null;
    return this.q.getContextUsage().catch(() => null);
  }

  /** Who the tool calls are being made as. Cached — the identity does not
   *  change within a query lifetime, and this is on the Settings render path. */
  async account(): Promise<Record<string, unknown> | null> {
    if (this.accountCache) return this.accountCache;
    if (!this.q) return null;
    const info = await this.q.accountInfo().catch(() => null);
    if (info) this.accountCache = info as Record<string, unknown>;
    return this.accountCache;
  }

  /**
   * Dollar figures are meaningless on subscription auth (`total_cost_usd` is
   * computed as if the tokens had been billed at API rates) and on 3P
   * providers. Gate every cost tile on this rather than rendering a number the
   * user has no way to reconcile with their bill.
   */
  costsAreReal(): boolean {
    const provider = this.accountCache?.apiProvider;
    const sub = this.accountCache?.subscriptionType;
    if (provider && provider !== "firstParty") return false;
    // A subscription of any kind means the cost is notional.
    return !sub;
  }

  /** Plan rate-limit window, when the CLI has pushed one. */
  limits(): Record<string, unknown> | null {
    return this.rateLimit;
  }

  /** Bounded CLI stderr for Diagnostics. */
  stderrTail(): string[] {
    return [...this.stderrRing];
  }

  get budgetUsd(): number | null {
    return this.meta.budgetUsd ?? null;
  }

  /**
   * Hard spend ceiling. Creation-time, so an idle query is recycled. A breached
   * session re-breaches on the very next message with the same cap, which is
   * why the client's stop card offers "raise budget" rather than only "resume".
   */
  async setBudget(usd: number | null): Promise<void> {
    this.meta.budgetUsd = usd && usd > 0 ? usd : undefined;
    this.saveMeta();
    await this.recycle();
    this.broadcast({ t: "budget", budgetUsd: this.meta.budgetUsd ?? null });
  }

  private ensureRunning(): void {
    if (this.q) return;

    const epoch = ++this.epoch;
    this.retireInputs();

    const self = this;
    async function* inputs(): AsyncIterable<SDKUserMessage> {
      for (;;) {
        const msg = await self.nextInput(epoch);
        if (msg === null) return; // superseded by a newer query
        yield msg;
      }
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
        //
        // 'local' is DELIBERATELY omitted. Adding it would execute a freshly
        // cloned repo's .claude/settings.local.json hooks, permissions and
        // enabled plugins — and DI's whole loop is "clone a repo you are about
        // to review". The cost is that a rule a user set locally in their
        // terminal will not apply here; Settings → Diagnostics says so, so it
        // reads as a stated choice rather than a mystery divergence.
        settingSources: ["user", "project"],
        // Hook events let us show whether caveman / RTK actually fired for a
        // turn — a real liveness signal instead of assuming they are working.
        includeHookEvents: true,
        includePartialMessages: true,
        // Read-only tools never mutate anything, and every one of them still
        // renders a tool card, so the transcript stays complete. Approving them
        // one at a time was pure approval fatigue.
        allowedTools: READ_ONLY_TOOLS,
        ...(this.meta.denyTools?.length ? { disallowedTools: this.meta.denyTools } : {}),
        // A cloned repo's .mcp.json must not auto-connect with no operator
        // involvement. DI passes no mcpServers, so this costs nothing today and
        // closes the hole the day it does.
        strictMcpConfig: true,
        settings: JSON.stringify({
          // A hostile repo — or a future bug in DI — must not be able to
          // escalate a session out of human review.
          permissions: { disableBypassPermissionsMode: "disable" },
        }),
        // Inert unless plan mode is on; ready the moment it is.
        planModeInstructions: PLAN_INSTRUCTIONS,
        ...(this.meta.maxTurns ? { maxTurns: this.meta.maxTurns } : {}),
        ...(this.meta.budgetUsd ? { maxBudgetUsd: this.meta.budgetUsd } : {}),
        // Degrade instead of failing the turn — but the reviewer is TOLD which
        // model actually ran (see `ranOn` on the result event). Under-reviewing
        // Sonnet output believing it came from Opus is a review-integrity bug,
        // so the disclosure ships with the feature, not after it.
        fallbackModel: FALLBACK_MODEL,
        // The CLI's own stderr, bounded. Without this, a misbehaving session
        // gives Diagnostics nothing to show.
        stderr: (line: string) => {
          this.stderrRing.push(line.slice(0, 2000));
          if (this.stderrRing.length > STDERR_LINES) this.stderrRing.shift();
        },
        permissionMode: this.meta.permissionMode ?? "default",
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
              this.onSystem(msg);
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
              this.inferBusy(true);
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
                // Why the turn ENDED — budget breach, max turns, refusal — not
                // just whether it succeeded.
                reason: msg.subtype,
                costUsd: "total_cost_usd" in msg ? msg.total_cost_usd : null,
                durationMs: msg.duration_ms,
                inputTokens: turn.inputTokens,
                outputTokens: turn.outputTokens,
                cacheReadTokens: turn.cacheReadTokens,
                // Which model ACTUALLY ran. Derived from the dominant
                // modelUsage key, never by set-membership against meta.model —
                // a fallback must be visible, not inferred from absence.
                ranOn: dominantModel(msg as unknown as Record<string, unknown>) ?? this.active,
                mode,
              });
              this.broadcast({ t: "usage", summary: this.ledger.summarize(this.ws.id) });
              this.inferBusy(false);
              break;
            }
            case "rate_limit_event": {
              // Subscription plans only — API-key/Bedrock/Vertex never send it.
              // Hitting a cap mid-review with no warning is worse than a blank
              // tile, and this is the only source for it.
              this.rateLimit = (msg as unknown as { rate_limit_info?: Record<string, unknown> })
                .rate_limit_info ?? null;
              this.broadcast({ t: "limits", limits: this.rateLimit });
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
        // The query is gone, so the CLI's last reported state is stale.
        this.cliState = null;
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
