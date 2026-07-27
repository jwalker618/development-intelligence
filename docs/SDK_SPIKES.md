# SDK spike results

Measured answers to the assumptions `docs/SDK_ROADMAP.md` said had to be
settled before the L-effort work could be scheduled. Reproduce with:

```
CLAUDE_CONFIG_DIR=… npx tsx scripts/spikes.mts [plan|rewind|budget|tasks|configdir]
```

Run against `@anthropic-ai/claude-agent-sdk@0.3.220` on 2026-07-27, first-party
OAuth (subscription) auth. Every answer below came from a real turn, not from
reading the type declarations.

---

## 1 · Does the CLI emit a user-message uuid we can anchor to? — **No, and it doesn't matter**

The CLI emits `type: "user"` messages only for **tool_result echoes**. The
user's own text message is never echoed back, so there is no server-visible
anchor for the turn.

The roadmap's cheaper alternative is the answer: **stamp our own
`SDKUserMessage.uuid` on the outgoing message**. The CLI adopts it, and the
checkpoint attaches to it.

> Consequence: DI must generate and persist a uuid per user message. Anything
> built on catching a replay would have found nothing.

## 2 · Do file checkpoints survive a query recycle and `resume`? — **Yes**

With `enableFileCheckpointing: true` and our own stamped uuid:

```
same query:    { canRewind: true, filesChanged: [".../note.txt"], insertions: 1, deletions: 1 }
after close +  { canRewind: true, filesChanged: [".../note.txt"], insertions: 1, deletions: 1 }
resume:
```

The checkpoint survived `close()` followed by a brand-new query resuming the
same session id. This is the condition the roadmap flagged as the risk that
would have made "most historical turns render inert" — it does not apply.

**Rewind (#23) is buildable**, and `dryRun` returns exactly the stats the
design asked for ("restores 1 file, +1 / −1").

Without a stamped uuid the same call returns
`{ canRewind: false, error: "No file checkpoint found for this message." }` for
every uuid the CLI emitted — which is what makes item 1 load-bearing rather
than cosmetic.

## 3 · Does `ExitPlanMode` route through `canUseTool`? — **Not reached; `canUseTool` is never called in plan mode at all**

Two turns in `permissionMode: "plan"`, the second explicitly instructing the
model to call `ExitPlanMode`:

- `canUseTool` saw: **nothing** — not `ExitPlanMode`, not the `Agent` and
  `Bash` calls the assistant did emit.
- The plan itself arrives as ordinary assistant text.

So plan mode blocks tool execution internally and never consults the callback.

**Consequence for what DI ships today:** "Plan first" is honest as a *mode* —
the agent proposes instead of acting — but a plan-approval **card** cannot be
built on `canUseTool`. Approving a plan is "read it, then switch the pill back
to Ask me", which is what the UI does now. Roadmap #24's card design needs a
different mechanism (or a later SDK); it is **not** scheduled on this evidence.

Free finding from the same run — channels the CLI emits that DI was not
watching: `active_goal`, `system/thinking_tokens`, `system/post_turn_summary`,
`system/background_tasks_changed`.

## 4 · Is `maxBudgetUsd` per-turn or conversation-wide? — **Conversation-wide**

| cap | turns | reported `total_cost_usd` | outcome |
|---|---|---|---|
| $0.02 | 1 | 0.0278 | `error_max_budget_usd` on turn 1 |
| $0.09 | 4 | 0.0284 → 0.0375 → 0.0467 → 0.0558 | all `success` |

Two things follow, and the second is the important one:

1. The ceiling is for the **session**, not the reply. A breached session
   re-breaches on the very next message with the same cap — hence the UI's
   "raise it here to continue" rather than a bare retry.
2. **`total_cost_usd` is CUMULATIVE.** Our usage ledger was storing it as a
   per-turn cost and summing it, which overstated a four-turn session as
   $0.168 instead of $0.056 — and the overstatement grows with turn count.
   `UsageLedger.record()` now stores the delta and keeps the raw cumulative
   figure alongside it. Fixed and unit-tested.

## 7 · Are task lifecycle messages emitted unconditionally? — **Yes**

One plain subagent dispatch produced:

```
task_started, task_progress, task_updated, task_notification, post_turn_summary
```

plus `background_tasks_changed` in the plan-mode run. **Roadmap #25 (the live
"In flight" section above the Tasks palette) is unblocked.** Note this covers
agent-initiated tasks only — it does not touch the user-defined runbook runner
`docs/task-runner-design.md` specifies, so `SAMPLE.tasks` stays true.

## 8 · Is `CLAUDE_CONFIG_DIR` a real writable location? — **Yes**

Writable, with `.claude.json` present. `sessionStore` stays off the table: the
volume-backed config dir is the cheaper durability answer, exactly as the
roadmap argued.

---

## Not yet measured

- **5 · Do programmatic hooks merge with or shadow settings-file hooks?** Gates
  #37. Needs a session with both kinds registered; `includeHookEvents` (now
  shipped) is the instrument for it.
- **6 · Does `applyFlagSettings({ effortLevel })` override the creation-time
  option?** Gates #39. Until measured, the query-recycle path stays.

---

## Harness note

`scripts/spikes.mts` drains the query on a **background** task. Returning or
breaking out of `for await (… of query)` calls the iterator's `.return()`,
which tears down the CLI transport — every control request afterwards fails
with `ProcessTransport is not ready for writing`. The first version of this
harness did exactly that and reported "no checkpoint" for a checkpoint that
existed. `server/agent.ts` has always drained in the background; a spike that
measures a control request has to do the same.
