/**
 * SDK spikes — the measurements that gate the L-effort roadmap items.
 *
 * Every one of these is an assumption `sdk.d.ts` does not document. Run this
 * before scheduling work that depends on one:
 *
 *   CLAUDE_CONFIG_DIR=… npx tsx scripts/spikes.mts [name …]
 *
 * Each spike costs a real (tiny) Claude turn. They are deliberately separate
 * so a single answer can be re-checked after an SDK bump without paying for
 * the rest.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query, type PermissionResult, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

const TIMEOUT_MS = 90_000;

type Verdict = { spike: string; answer: string; detail: string };
const results: Verdict[] = [];

function say(v: Verdict): void {
  results.push(v);
  console.log(`\n── ${v.spike}\n   ANSWER: ${v.answer}\n   ${v.detail}\n`);
}

/** A scratch workspace. `git` mirrors DI's real shape — every session
 *  workspace is a clone, and some CLI features (checkpointing among them) may
 *  depend on that. Pass false to isolate whether git is the condition. */
function scratch(name: string, git = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `di-spike-${name}-`));
  fs.writeFileSync(path.join(dir, "README.md"), "spike workspace\n");
  fs.writeFileSync(path.join(dir, "note.txt"), "original\n");
  if (git) {
    const run = (args: string[]) => spawnSync("git", args, { cwd: dir, stdio: "ignore" });
    run(["init", "-q", "-b", "main"]);
    run(["add", "-A"]);
    run(["-c", "user.email=spike@di", "-c", "user.name=spike", "commit", "-qm", "init"]);
  }
  return dir;
}

interface Spiked {
  q: ReturnType<typeof query>;
  /** Send a message and resolve when its `result` lands. */
  turn(text: string, onMsg?: (m: Record<string, unknown>) => void, uuid?: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * A query with a manual input queue and a BACKGROUND drain.
 *
 * The drain matters: returning (or breaking) out of `for await (… of query)`
 * calls the iterator's `.return()`, which tears the CLI transport down — every
 * control request after that fails with "ProcessTransport is not ready for
 * writing". A spike that measures a control request must therefore never own
 * the loop, exactly as server/agent.ts does not.
 */
function open(dir: string, options: Record<string, unknown> = {}): Spiked {
  let resolveNext: ((m: SDKUserMessage) => void) | null = null;
  const backlog: SDKUserMessage[] = [];
  async function* inputs(): AsyncIterable<SDKUserMessage> {
    for (;;) {
      const queued = backlog.shift();
      if (queued) { yield queued; continue; }
      yield await new Promise<SDKUserMessage>((r) => { resolveNext = r; });
    }
  }
  const q = query({
    prompt: inputs(),
    options: { cwd: dir, settingSources: [], includePartialMessages: false, ...options },
  });

  let onTurnMsg: ((m: Record<string, unknown>) => void) | null = null;
  let finishTurn: (() => void) | null = null;
  void (async () => {
    try {
      for await (const m of q) {
        onTurnMsg?.(m as unknown as Record<string, unknown>);
        if (m.type === "result" && finishTurn) { const f = finishTurn; finishTurn = null; f(); }
      }
    } catch { /* the spike reports whatever it managed to observe */ }
  })();

  return {
    q,
    turn(text, onMsg, uuid) {
      onTurnMsg = onMsg ?? null;
      const done = new Promise<void>((resolve, reject) => {
        finishTurn = resolve;
        setTimeout(() => reject(new Error("spike turn timed out")), TIMEOUT_MS).unref?.();
      });
      const msg = {
        type: "user",
        message: { role: "user", content: [{ type: "text", text }] },
        parent_tool_use_id: null,
        ...(uuid ? { uuid } : {}),
      } as SDKUserMessage;
      if (resolveNext) { const r = resolveNext; resolveNext = null; r(msg); }
      else backlog.push(msg);
      return done;
    },
    async close() {
      try { await (q as unknown as { close?(): Promise<void> }).close?.(); } catch { /* already gone */ }
    },
  };
}

// ── 3. Does ExitPlanMode route through canUseTool? ──────────────────────────
// Gates the plan-approval card. DI already SHIPS `permissionMode: 'plan'`, so
// if the answer is no, that mode hangs with no way to approve the plan.
async function spikePlanMode(): Promise<void> {
  const dir = scratch("plan");
  const seenTools: string[] = [];
  let sawExitPlan = false;
  const s = open(dir, {
    permissionMode: "plan",
    canUseTool: async (toolName: string): Promise<PermissionResult> => {
      seenTools.push(toolName);
      if (toolName === "ExitPlanMode") sawExitPlan = true;
      return { behavior: "deny", message: "spike: observing only" };
    },
  });
  const assistantTools: string[] = [];
  const otherChannels = new Set<string>();
  const watch = (m: Record<string, unknown>) => {
    if (m.type === "assistant") {
      for (const b of (m.message as { content: Array<Record<string, unknown>> }).content) {
        if (b.type === "tool_use") assistantTools.push(String(b.name));
      }
    } else if (m.type === "system") {
      otherChannels.add(`system/${String(m.subtype)}`);
    } else if (m.type !== "user" && m.type !== "result" && m.type !== "stream_event") {
      otherChannels.add(String(m.type));
    }
  };
  try {
    // Two turns: the model usually presents a plan first and only calls
    // ExitPlanMode once told to proceed.
    await s.turn("Plan (do not implement) how to add a LICENSE file to this repo.", watch);
    await s.turn("That plan is approved. Call ExitPlanMode now so you can start.", watch);
  } catch (e) {
    say({ spike: "3 · ExitPlanMode via canUseTool", answer: "INCONCLUSIVE", detail: String(e) });
    return;
  }
  await s.close();
  say({
    spike: "3 · ExitPlanMode via canUseTool",
    answer: sawExitPlan ? "YES" : assistantTools.includes("ExitPlanMode") ? "NO — emitted but not gated" : "NOT REACHED",
    detail: `canUseTool saw: [${seenTools.join(", ") || "none"}]. assistant emitted: [${assistantTools.join(", ") || "none"}]. other channels: [${[...otherChannels].join(", ")}].`,
  });
}

// ── 1 + 2. File checkpoints: do they exist, and do they survive a recycle? ──
// Gates "Rewind turn". DI always passes `resume:` and rebuilds the query on
// every effort/permission/budget change, so a checkpoint bound to one query
// lifetime would make most historical turns inert.
async function spikeRewind(): Promise<void> {
  const dir = scratch("rewind");
  // Collect EVERY user-message uuid: the SDK emits `user` for tool_result
  // echoes too, and only the turn-opening one is a rewind anchor.
  const userUuids: Array<{ uuid: string; isText: boolean }> = [];
  let sessionId: string | null = null;
  const opts = { enableFileCheckpointing: true, permissionMode: "acceptEdits" };
  const first = open(dir, opts);
  // Stamp our OWN uuid on the outgoing message. The roadmap's cheaper
  // alternative to catching a replay — and, as it turns out, the only anchor
  // available, since the CLI never echoes the user's text message back.
  const ours = randomUUID();
  try {
    await first.turn("Replace the contents of note.txt with the single word: changed", (m) => {
      if (m.type === "system" && m.subtype === "init") sessionId = String(m.session_id);
      if (m.type === "user" && m.uuid) {
        const content = (m.message as { content?: unknown })?.content;
        const isText = typeof content === "string"
          || (Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === "text"));
        userUuids.push({ uuid: String(m.uuid), isText });
      }
    }, ours);
  } catch (e) {
    say({ spike: "1+2 · rewindFiles", answer: "INCONCLUSIVE", detail: String(e) });
    return;
  }
  const changed = fs.readFileSync(path.join(dir, "note.txt"), "utf8").trim();
  const probe = async (chat: Spiked) => {
    const tried: Array<{ uuid: string; isText: boolean; res: unknown }> = [];
    for (const u of [{ uuid: ours, isText: true }, ...userUuids]) {
      const res = await (chat.q as unknown as { rewindFiles(x: string, o?: { dryRun?: boolean }): Promise<unknown> })
        .rewindFiles(u.uuid, { dryRun: true }).catch((e: unknown) => ({ error: String(e) }));
      tried.push({ ...u, res });
      if ((res as { canRewind?: boolean })?.canRewind) break;
    }
    return tried;
  };
  const sameQuery = await probe(first);

  // Now the part that actually matters: a NEW query resuming the same session.
  await first.close();
  const second = open(dir, { ...opts, resume: sessionId ?? undefined });
  // A control request needs the process up; one trivial turn guarantees that.
  await second.turn("Reply with the word ready.").catch(() => undefined);
  const afterRecycle = await probe(second);
  await second.close();

  const ok = (t: Array<{ res: unknown }>) => t.some((x) => (x.res as { canRewind?: boolean })?.canRewind === true);
  say({
    spike: "1 · user message uuid",
    answer: userUuids.length ? `EMITTED (${userUuids.length})` : "NOT EMITTED",
    detail: userUuids.length
      ? userUuids.map((u) => `${u.uuid.slice(0, 8)}${u.isText ? " (text)" : " (tool_result)"}`).join(", ")
      : "no `user` message carried a uuid — stamp our own instead.",
  });
  say({
    spike: "2 · checkpoints survive a recycle + resume",
    answer: ok(sameQuery) ? (ok(afterRecycle) ? "YES" : "NO — same query only") : "NO CHECKPOINT",
    detail: `edit landed (note.txt = "${changed}").\n   same query:  ${JSON.stringify(sameQuery)}\n   after resume: ${JSON.stringify(afterRecycle)}`,
  });
}

// ── 4. Is maxBudgetUsd per turn or conversation-wide? ───────────────────────
// DI's query is long-lived across many turns, so the difference decides
// whether the ceiling means "this reply" or "this session".
async function spikeBudget(): Promise<void> {
  const dir = scratch("budget");
  // A ceiling a SINGLE turn will not cross, so a breach can only mean the cap
  // accumulates across the conversation.
  const CAP = Number(process.env.SPIKE_CAP ?? 0.09);
  const s = open(dir, { maxBudgetUsd: CAP });
  const subtypes: string[] = [];
  const costs: number[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      await s.turn(`Reply with a single word: turn${i}`, (m) => {
        if (m.type === "result") {
          subtypes.push(String(m.subtype));
          if (typeof m.total_cost_usd === "number") costs.push(m.total_cost_usd);
        }
      });
      if (subtypes.at(-1)?.includes("budget")) break;
    }
  } catch (e) {
    say({ spike: "4 · maxBudgetUsd scope", answer: "INCONCLUSIVE", detail: String(e) });
    return;
  }
  await s.close();
  const breached = subtypes.findIndex((s) => s.includes("budget"));
  say({
    spike: "4 · maxBudgetUsd scope",
    answer: breached === 0 ? "PER TURN (first turn already over)" : breached > 0 ? "CONVERSATION-WIDE" : "NOT BREACHED",
    detail: `result subtypes: [${subtypes.join(", ")}]. reported costs: [${costs.join(", ")}] against a $${CAP} cap.`,
  });
}

// ── 7. Are task lifecycle messages emitted unconditionally? ─────────────────
// Gates the live "In flight" section of the Tasks screen.
async function spikeTasks(): Promise<void> {
  const dir = scratch("tasks");
  const s = open(dir, { permissionMode: "acceptEdits" });
  const subtypes = new Set<string>();
  try {
    await s.turn("Use a subagent to count the files in this directory.", (m) => {
      if (m.type === "system" && m.subtype) subtypes.add(String(m.subtype));
      if (typeof m.type === "string" && m.type.startsWith("task")) subtypes.add(String(m.type));
    });
  } catch (e) {
    say({ spike: "7 · task lifecycle messages", answer: "INCONCLUSIVE", detail: String(e) });
    return;
  }
  await s.close();
  const taskish = [...subtypes].filter((s) => /task|background/i.test(s));
  say({
    spike: "7 · task lifecycle messages",
    answer: taskish.length ? "EMITTED" : "NOT EMITTED for a plain subagent",
    detail: `system subtypes seen: [${[...subtypes].join(", ")}].`,
  });
}

// ── 8. Is CLAUDE_CONFIG_DIR on a real (writable, persistent) mount? ─────────
// Cheap, local, no API call. Determines whether sessionStore is off the table.
function spikeConfigDir(): void {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  let writable = false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".di-spike-probe");
    fs.writeFileSync(probe, "x");
    fs.rmSync(probe, { force: true });
    writable = true;
  } catch { writable = false; }
  const stateFile = path.join(dir, ".claude.json");
  say({
    spike: "8 · CLAUDE_CONFIG_DIR",
    answer: writable ? "WRITABLE" : "NOT WRITABLE",
    detail: `${dir} · state file ${fs.existsSync(stateFile) ? "present" : "absent"} · CLAUDE_CONFIG_DIR ${process.env.CLAUDE_CONFIG_DIR ? "set" : "unset (using ~/.claude)"}`,
  });
}

const SPIKES: Record<string, () => void | Promise<void>> = {
  plan: spikePlanMode,
  rewind: spikeRewind,
  budget: spikeBudget,
  tasks: spikeTasks,
  configdir: spikeConfigDir,
};

const wanted = process.argv.slice(2).filter((a) => a in SPIKES);
const run = wanted.length ? wanted : Object.keys(SPIKES);
for (const name of run) {
  try { await SPIKES[name](); }
  catch (e) { say({ spike: name, answer: "THREW", detail: String(e) }); }
}
console.log("\n══ SUMMARY ══");
for (const r of results) console.log(`${r.answer.padEnd(34)} ${r.spike}`);
process.exit(0);
