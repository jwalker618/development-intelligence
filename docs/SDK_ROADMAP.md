# Development Intelligence — SDK Capability Roadmap

**Basis:** four adversarially-verified capability audits against `@anthropic-ai/claude-agent-sdk@0.3.220` (confirmed installed; the version drift noted mid-audit is resolved — `package.json:17` and `node_modules/@anthropic-ai/claude-agent-sdk/package.json` both read `0.3.220`).

**Ordering principle:** DI is a *review-first* IDE. A capability earns priority when it (a) fixes a correctness defect in the review loop, (b) replaces SAMPLE/placeholder data with truth, or (c) gives the reviewer a control they genuinely lack — undo, a gate before action, an honest meter, a branch. Generic SDK completeness earns nothing.

---

## STATUS — what has shipped (2026-07-27)

Everything below in §1, §2 and the flagship §3 items marked ✅ is **built,
verified against the real Anthropic API, and on `main`**. The tables that
follow are kept for their rationale; read this section for current state.

| # | Item | State |
|---|---|---|
| 1–5 | Query close, abortController, session state, double-render, Tasks crash | ✅ shipped |
| 6 | `SDKResultMessage.usage` ledger | ✅ shipped — **and corrected**: `total_cost_usd` is cumulative, see §4 of `SDK_SPIKES.md` |
| 7 | `SDKSystemMessage` init inventories | ✅ shipped, plus `initializationResult()` hydration — init does **not** arrive until turn one |
| 8 | `maxBudgetUsd` | ✅ shipped, **conversation-wide** (measured), gated on `costsAreReal` |
| 9 | `SDKPermissionDeniedMessage` | ✅ shipped — "blocked · Bash" transcript rows |
| 10 | `SDKInformationalMessage` | ✅ shipped — hook block reasons no longer vanish |
| 11–15 | allowedTools, disallowedTools, strictMcpConfig, bypass lock, planModeInstructions | ✅ shipped |
| 16 | `settingSources` — the `local` decision | ✅ **decided**: omitted deliberately, stated in Settings → Diagnostics |
| 17 | `canUseTool` full fields | ✅ shipped |
| 18 | `permissionMode` + live setter | ✅ shipped — the leash pill |
| 19 | `getContextUsage()` + `compact_boundary` | ✅ shipped — real context meter, compaction is a visible event |
| 20 | `initializationResult()` | ✅ shipped |
| 21 | Warm the query | ✅ shipped — `warm()` + `?warm=1` |
| 22 | `accountInfo()` | ✅ shipped — and it is now the **authoritative** "Claude is connected" signal |
| 23 | **Rewind** | ✅ **shipped** — needs our own stamped uuid; checkpoints survive resume |
| 24 | Plan mode + ExitPlanMode card | ⛔ **mode shipped, card unscheduled** — `canUseTool` is never invoked in plan mode (measured) |
| 25 | Task lifecycle | ✅ live "In flight" section shipped; runbook runner still unbuilt, `SAMPLE.tasks` stays true |
| 26 | Unhandled stream kinds | ⬜ open |
| 27 | `fallbackModel` + disclosure | ✅ shipped — `ranOn` ranked on **output** tokens only |
| 28 | `includeHookEvents` | ✅ shipped — hook liveness chips |
| 29 | Rate limits | ✅ shipped — `SDKRateLimitEvent` → plan-window line |
| 30–32 | supportedCommands push, promptSuggestions, thinking config | ⬜ open (commands_changed is handled; the chips are not rebuilt from it yet) |
| 33 | `stderr` | ✅ shipped — Diagnostics |
| 34 | `maxTurns` | ✅ plumbed (`ChatMeta.maxTurns`), no UI yet |
| 35–46 | Fork, session management, hooks, agents, applyFlagSettings, MCP panel, … | ⬜ open |

**Spikes:** 1, 2, 3, 4, 7 and 8 are answered — see `docs/SDK_SPIKES.md`.
5 and 6 remain unmeasured and still gate #37 and #39 respectively.

Also shipped alongside, not from this roadmap: **multi-repo sessions** (a
session holds an ordered list of checkouts; `?repo=` routes every file and git
call; the agent gets the rest as `additionalDirectories`).

---

## 0 · The placeholder ledger — what actually closes a fake surface

`docs/WIRING_STATUS.md` marks exactly **four** ⚫ NO BACKEND items: caveman "% context saved" KPI (:63), RTK "+% tokens returned" (:64), Preview runtime-errors card (:95), Tasks (whole screen). Plus a set of 🟡 COSMETIC controls. Here is the honest mapping.

### Genuinely closes a placeholder

| Placeholder | Capability that closes it | How honest |
|---|---|---|
| **RTK "+% tokens returned"** ⚫ (`src/di/screens/Session.tsx:90-91`, hardcoded off `state.ts` seed) | `SDKResultMessage.usage` / `.modelUsage` | **Fully replaced.** This is the one tile that is fabricated rather than labelled, and real per-turn/per-session token + dollar data lands in its place. |
| **Caveman "% context saved"** ⚫ | `SDKResultMessage.usage` + `getContextUsage()` | **Upgraded, not literally computed.** The tile already prefers a real value and shows a `SampleChip` otherwise (`Session.tsx:87-88`) — it is honest today. There is no counterfactual "what would it have cost without caveman" anywhere in the SDK. We replace a percentage with a *real* context/token meter and say so. |
| **Tasks screen** ⚫ | Task lifecycle messages (`task_started` / `task_progress` / `task_updated` / `task_notification` / `background_tasks_changed`) | **Partially — one new section only.** These are agent-initiated Bash/subagent tasks. `docs/task-runner-design.md` specifies a *user-defined runbook runner* (typed params, secret refs, provisioning cache, confirm gates). Add a live "In flight" section **above** the seeded palette; **do not** flip `SAMPLE.tasks` to false. |
| **Hardcoded model list + effort heuristic** (undocumented placeholder: `Session.tsx:14`, `:21-26`, `:29-32`; `server/index.ts:297`) | `initializationResult().models` (`ModelInfo.supportsEffort`, `supportedEffortLevels`, `resolvedModel`) | **Fully replaced**, three hardcodes retired at once. |
| **Hardcoded chat suggestion chips** (undocumented placeholder: `Session.tsx:234`) | `SDKSystemMessage.slash_commands` (free, at init) → later `supportedCommands()` + `commands_changed` | **Replaced for warm sessions.** Cold start still needs the hardcoded trio — the SDK suppresses suggestions on turn one. |
| **Model pill 🟡 / Diagnostics 🔴** (`WIRING_STATUS.md:40`, `:61`) | — | **Already shipped.** These doc rows are stale: `Session.tsx:195-201` has a working picker, `Settings.tsx` has a wired `DiagnosticsSection`. Fix the doc; do not schedule work against these rows. |

### Sounds like it closes a placeholder — **it does not**

- **`rewindFiles()` ≠ per-hunk Revert 🟡.** `WIRING_STATUS.md:75` and Phase-2 item 7 ask for `git checkout -- <path>` / reverse-apply. `rewindFiles` has no path or hunk argument — it reverts *everything* the agent touched since a user message. Wiring it to the Revert button at `src/di/screens/Changes.tsx:177` would silently discard the reviewer's other same-turn edits. Rewind is a **new control on the transcript**, labelled "Rewind turn". §C-7 stays open.
- **`forkSession()` / `resumeSessionAt` ≠ Timeline ticks 🟡.** That timeline is `git log` (`WIRING_STATUS.md:59`; `src/di/useControl.ts:76` builds it from `GET /api/sessions/:id/git/log`). `TimelineTick` (`src/di/state.ts:47`) carries no message identity. Branching the conversation does not make commit ticks clickable — that still needs a git checkout op.
- **Hooks ≠ Preview runtime-errors card ⚫.** That card is about the *previewed app's* console/network errors inside the iframe (`WIRING_STATUS.md:135`). A `PostToolUse` hook captures the *agent's* tool failures. Different signal entirely.
- **`reloadSkills()` ≠ caveman % KPI.** A "skill loaded" boolean is a different question from "% context saved", and DI's caveman dial is driven by `server/caveman.ts` flag files — a different mechanism again. Putting the pill next to the dial would mislead.
- **`AgentDefinition` ≠ Tasks backend.** An agent is a prompt plus tool restrictions. `TaskManifest` (`src/di/state.ts:70-84`) needs `runTemplate`, `secretRefs`, `setupStatus`, typed int/bool params, `confirm{challenge,expect}`. Building Tasks on agents fabricates nine of twelve fields.
- **`accountInfo()` ≠ a documented gap.** Neither doc mentions email/plan/subscription. `Settings.tsx` already ships the auth card `DESIGN_GAPS.md §C` asked for. This is an enhancement to a live surface — still worth doing, just not gap closure.

---

## 1 · Ship now — small, high impact

### 1A. Correctness first (these are live defects, not features)

| # | Capability | What the user gains | Files | Effort |
|---|---|---|---|---|
| 1 | **`Query.close()` + per-query input queue** | Sessions stop leaking a Claude CLI subprocess on every effort change and every session delete; changing effort actually takes effect; the working·stop indicator stops flapping mid-turn. | `/home/user/development-intelligence/server/agent.ts` (`setEffort`:236, `destroy`, `ensureRunning`:290, `inputWaiters`/`inputBacklog`:74-75, `nextInput`:284) | **S** |
| 2 | **`Options.abortController`** | Graceful CLI teardown (stdin EOF → ~2s grace) so the transcript JSONL that resume/fork/listSessions all read is actually flushed before the child dies. | `server/agent.ts` (`ensureRunning`:290) | **S** |
| 3 | **`SDKSessionStateChangedMessage`** | The spinner reflects the CLI's own ground truth (`idle`/`running`/`requires_action`) instead of six inference sites, killing a whole class of stuck-spinner bugs on the phone. | `server/agent.ts` (`case "system"`:347, `setBusy`:154), `src/di/control.ts`, `src/di/screens/Session.tsx` | **S** |
| 4 | **Fix double-rendered assistant text** *(not an SDK capability — a bug found in this surface)* | Every streamed reply stops appearing twice: `appendDelta` builds a bubble, then the durable `text` event appends a second identical one. Key both on the assistant message uuid. | `server/agent.ts:366-372`, `src/di/control.ts` (`foldEvent`), `src/di/useControl.ts` (duplicate `foldOne`) | **S** |
| 5 | **Guard `Tasks.tsx` empty-list crash** | `useState(s.tasks[0].id)` / `s.tasks.find(...)!` crash the screen the moment any live list is empty. Blocks every Tasks wiring item below. | `src/di/screens/Tasks.tsx:9-10` | **S** |

> ⚠️ **`src/di/useControl.ts` has two fold implementations** (`foldEvent` in `control.ts:209-223` and `foldOne` in `useControl.ts:164-171`). Every new event kind must be added to **both**, or replayed history and live events will disagree. This trips up almost every item below.

### 1B. One-line and near-one-line wins

| # | Capability | What the user gains | Files | Effort |
|---|---|---|---|---|
| 6 | **`SDKResultMessage.usage` / `.modelUsage`** ⭐ *closes RTK placeholder* | A real per-turn and per-session token + dollar ledger, cache-reuse ratio, per-model attribution, `permission_denials` count, and `terminal_reason` (why the turn ended) — all from a message we already receive and throw away. | `server/agent.ts:397-408` (`case "result"`), `ChatMeta`:83 + `saveMeta`:124 + `hello` frame, `src/di/control.ts`, `src/di/screens/Session.tsx:85-91` | **S** |
| 7 | **`SDKSystemMessage` init fields** ⭐ *closes hardcoded chips* | Free inventories of slash commands, skills, plugins, agents, MCP servers and negotiated betas — the cheapest honest win in the entire audit, zero new SDK calls, zero round-trips. | `server/agent.ts:347-354` (widen `emit("init", …)`), `hello` frame, `src/di/control.ts:252-259` | **S** |
| 8 | **`maxBudgetUsd`** | A hard spend ceiling with a typed stop (`error_max_budget_usd`) and a "$1.40 of $5.00" meter — the single control that makes an unattended phone-away run defensible. | `server/agent.ts` (options literal :302, `ChatMeta`:83), `server/index.ts` (new `POST …/chat/budget`), `Session.tsx` header | **S** |
| 9 | **`SDKPermissionDeniedMessage` + `permission_denials`** | Auto-denied tool calls (classifier / `dontAsk` / deny rule) become visible as "blocked: Bash — deny rule" rows instead of looking like the agent underperformed. Hard prerequisite for shipping `auto`/`dontAsk`. | `server/agent.ts` (`case "system"`:347, `ChatEventKind`, `case "result"`:397), `src/di/control.ts` + `useControl.ts` folds | **S** |
| 10 | **`SDKInformationalMessage`** | Hook block reasons and status lines stop vanishing — today a caveman/RTK hook can block a turn and the phone shows a prompt that appears to do nothing. This is a silent-failure hole dead-centre of DI's positioning (`settingSources: ["user","project"]`). | `server/agent.ts` (`case "system"`:347), both folds | **S** |
| 11 | **`allowedTools: ['Read','Grep','Glob']`** | Approval fatigue drops sharply — the reviewer is interrupted only for things that mutate state; read-only tools still render tool cards, so the transcript stays complete. | `server/agent.ts:302` | **S** |
| 12 | **`disallowedTools`** | A session opened as "read-only review" is *structurally* incapable of mutation — a promise you can put in the UI honestly, not "instructed not to". | `server/agent.ts:302`, `ChatMeta`, `server/index.ts:307` (`POST /api/sessions`), `src/di/frontdoor/SessionsHome.tsx` | **S** |
| 13 | **`strictMcpConfig: true`** | A cloned third-party repo's `.mcp.json` stops being auto-connected with no operator involvement and no UI showing it happened. DI passes no `mcpServers`, so this costs literally nothing today. | `server/agent.ts:302`, `server/config.ts` | **S** |
| 14 | **`permissions.disableBypassPermissionsMode: 'disable'`** | A hostile cloned repo (or a future DI bug) cannot escalate a session out of human review. Pair with a one-line assertion over the options literal. | `server/agent.ts:302` (`settings:` option) | **S** |
| 15 | **`planModeInstructions`** | Plans arrive as "≤7 numbered steps, name every file you will touch" instead of prose. Inert unless plan mode is on, so it ships with zero risk today and is ready when item 24 lands. | `server/agent.ts:302` | **S** |
| 16 | **`settingSources` — the `local` decision** | Either `.claude/settings.local.json` starts loading (matching terminal `claude`), or the deliberate omission gets documented and surfaced in `DiagnosticsSection`. Today it is an undocumented divergence that will generate "works in my terminal, not in DI" reports. | `server/agent.ts:308` + comment, `src/di/frontdoor/Settings.tsx` | **S** |

> Item 16 is a **decision, not necessarily a code change**. Adding `'local'` means a freshly cloned untrusted repo's hooks/permissions/enabledPlugins execute. For a product whose core loop is "clone a repo you are about to review", keeping the omission may be correct — it just has to be a stated choice.

---

## 2 · Next — meaningful builds

### 2A. The review-first controls DI actually lacks

| # | Capability | What the user gains | Files | Effort |
|---|---|---|---|---|
| 17 | **`canUseTool` — the unused fields** ⭐ **highest-confidence item in the whole audit** | The approval card stops being yes/no and becomes a review instrument: blast-radius `description`, the offending `blockedPath`, `decisionReason`, a subagent badge, an **Edit** affordance (`updatedInput`) so a reviewer fixes a bad `rm -rf` argument instead of denying and re-prompting in prose, and a "Deny and stop" sibling (`interrupt: true`). | `server/agent.ts:313-341` (`canUseTool`, `pending`:76, `resolveApproval`:258), `server/index.ts:273` (approval route), `src/di/control.ts:218-219`, `Session.tsx` | **M** |
| 18 | **`permissionMode` + `Query.setPermissionMode()`** | A segmented "Ask me / Auto-accept edits / Plan first / Fail-closed" pill in the Session header, changeable mid-session with a real live setter — the leash-length choice a phone-first reviewer needs before pocketing the phone. | `server/agent.ts` (`ChatMeta`:83, options :302, new `setPermissionMode` mirroring `setModel`:226), `server/index.ts` (new route), `src/di/control.ts:199-205` + `:252-272`, `Session.tsx` | **M** |
| 19 | **`getContextUsage()` + `compact_boundary`** ⭐ *upgrades caveman KPI* | A live context-window meter with an auto-compact warning, plus an auditable prompt budget (which memory files, skills and MCP tools are costing what) and a visible cost for pinned context. Compaction becomes a *visible review event* rather than a silent context change. | `server/agent.ts` (new `contextUsage()`, `case "system"`:347, `case "result"`:397), `server/index.ts` (`GET …/chat/context`), `src/di/control.ts:250-272`, `state.ts:92-93`, `Session.tsx` | **M** |
| 20 | **`initializationResult()`** ⭐ *closes 3 hardcodes* | Model picker driven by the real, provider-filtered catalog with per-model effort support; effort dial stops guessing via `!id.includes('haiku')`; persisted model ids match correctly against `resolvedModel` aliases. Account info arrives on the same call. | `server/agent.ts` (`warm()` — see #21), `server/index.ts:297`, `src/di/control.ts:252-259`, `useControl.ts:11-22`, `Session.tsx:14`, `:21-26`, `:29-32`, `:195-201` | **M** |
| 21 | **PREREQ: warm the query before the first message** | Every control-request capability (context meter, catalog, account, MCP status) currently has no data source until the user sends a message — the meter is blank exactly when a new user first looks at it. | `server/agent.ts` (`ensureRunning`:290 → public `warm()`; move `setBusy(true)` out of the init branch into `send`) | **M** |
| 22 | **`accountInfo()`** | "Connected as … · Max" instead of a blind trust step — the human is approving tool calls made under that account's credentials and quota. `apiProvider` also lets DI suppress dollar tiles on Bedrock/Vertex where they are meaningless. | `server/agent.ts` (cache on `ChatMeta`, `hello` frame), `src/di/frontdoor/Settings.tsx`, `src/di/frontdoor/ConnectClaude.tsx:12` (delete the now-false comment) | **S** |
| 23 | **`enableFileCheckpointing` + `rewindFiles()` + `dryRun`** ⭐ **the flagship review affordance** | "Rewind turn" on a user bubble: tap → dry-run preview ("restores 4 files, −218 / +31") → confirm. DI has **no undo over agent edits today**. | `server/agent.ts` (options :302, new `rewind()`, uuid capture in `case "user"`:382 / `case "assistant"`:366, `ChatEventKind`), `server/index.ts` (new route), `src/di/control.ts:190-197` + folds, `Session.tsx` (user bubbles), reuse the typed-challenge gate from `Tasks.tsx:80,150-160` | **L** |
| 24 | **`permissionMode: 'plan'` + ExitPlanMode card** | Review *intent* before code exists — the purest expression of DI's thesis and the highest-leverage phone screen in the product. Approve, edit, or reject a plan; approving also flips the mode so the agent doesn't appear to hang. | `server/agent.ts` (`canUseTool`:313 special-case, `resolveApproval`:258), `src/di/control.ts:190-197`, `Session.tsx` (plan card) | **L** |
| 25 | **Task lifecycle messages + `backgroundTasks()` + `stopTask()`** ⭐ *partially fills Tasks* | "What is the agent doing right now, and can I stop it" — a live In-flight panel, plus a third option beyond interrupt: *keep going without me, tell me when it lands*. | `server/agent.ts` (`case "system"`:347 sub-branches, `agentProgressSummaries`, `hello` frame), `server/index.ts` (background/stop routes), `src/di/control.ts`, `src/di/screens/Tasks.tsx` (new section above the palette) | **M** |
| 26 | **`includePartialMessages` — the unhandled stream kinds** | Tool cards appear the instant the model starts emitting the call rather than after the block completes; thinking, tool progress, compaction and conversation-reset all stop being invisible. **Note:** `BetaRawMessageStreamEvent` *does* resolve (`@anthropic-ai/sdk@0.112.1` is installed as a pnpm peer) — delete the hand-cast at `agent.ts:356-362` and switch on the real discriminated union. | `server/agent.ts:356-362` + ~8 new top-level cases, `src/di/control.ts` + `useControl.ts` folds (transcript identity model) | **L** |

### 2B. Honest instrumentation

| # | Capability | What the user gains | Files | Effort |
|---|---|---|---|---|
| 27 | **`fallbackModel` + "ran on \<model\>" labelling** | The session degrades instead of failing the turn, **and the reviewer is told** — under-reviewing Sonnet output believing it came from Opus is a review-integrity failure, so the disclosure ships *with* the feature, not after. Detect via the dominant `modelUsage` key normalized through `resolvedModel`, never by set-membership against `meta.model`. | `server/agent.ts:302` + `case "system"` (`api_retry`), `server/config.ts`, `src/di/control.ts:250-272`, `Session.tsx` model pill | **S** |
| 28 | **`includeHookEvents`** | A real per-turn liveness chip for caveman and RTK: fired / did not fire / errored. Verified in scope — `docker-entrypoint.sh:51-52` registers RTK through the same settings-file hook layer. Not a percentage; a boolean, honestly labelled. | `server/agent.ts:302` + `case "system"`:347, `src/di/control.ts:17-19` (`SAMPLE`), `Session.tsx` KPI chip | **S** |
| 29 | **`usage_EXPERIMENTAL…()` + `SDKRateLimitEvent`** | "78% of your 5-hour window, resets at 14:20" — hitting a plan cap mid-review with no warning is worse than any blank tile, and this is the only source for it. Also the cross-check for our hand-rolled session ledger. | `server/agent.ts` (feature-detected adapter, new `case "rate_limit_event"`), `src/di/frontdoor/Settings.tsx` (experimental-labelled panel only) | **S** |
| 30 | **`supportedCommands()` + `SDKCommandsChangedMessage`** | Repo-aware slash-command chips with real descriptions, kept self-healing during long sessions (a re-fetch returns the *stale* init list — the push is the only fresh source). | `server/agent.ts` (`case "system"`:347), `server/index.ts`, `src/api.ts`, `src/di/control.ts`, `Session.tsx:234` | **M** |
| 31 | **`promptSuggestions`** | One model-authored follow-up chip after each turn. Honest scope: the SDK suppresses suggestions on turn one, which is exactly when `Session.tsx:237` renders the hardcoded trio — so cold start is unchanged. | `server/agent.ts:302` + `case "prompt_suggestion"` (genuinely on the default arm), `src/di/control.ts`, `Session.tsx` | **S** |
| 32 | **`thinking` config + `SDKThinkingTokensMessage`** | A "thinking · ~4.2k" pill instead of dead-air silence during a long reasoning phase, plus an honest cost/latency knob. Use `applyFlagSettings({ alwaysThinkingEnabled, showThinkingSummaries })` for the live on/off path — not the deprecated `setMaxThinkingTokens`. | `server/agent.ts` (`ChatMeta`, options :302, `case "system"`), `server/index.ts`, `src/di/control.ts`, `Session.tsx:344-371` (`EffortPicker`) | **M** |
| 33 | **`stderr` / `debugFile`** | The already-shipped `DiagnosticsSection` gains CLI-process-level detail — today when a session misbehaves the CLI's own stderr is invisible to DI. | `server/agent.ts:302` (bounded ring buffer), `server/index.ts` (`GET …/diag`), `src/di/frontdoor/Settings.tsx` | **S** |
| 34 | **`maxTurns`** | A runaway-loop brake orthogonal to cost — a cheap model can loop a long time for very little money while producing enormous review churn. Leave unset or high until measured. | `server/agent.ts:302`, `case "result"`:397 | **S** |

---

## 3 · Later / strategic

| # | Capability | What the user gains | Files | Effort |
|---|---|---|---|---|
| 35 | **`forkSession()` + branch list** | "Try a different approach from here" without losing the original attempt — the review→steer loop that is DI's centre of gravity. | `server/agent.ts` (`branch()`, ChatEvent JSONL copy), `server/sessions.ts`, `server/index.ts` (`GET …/branches`), new branch UI | **L** |
| 36 | **`listSessions()` / `renameSession()` / `tagSession()` / `deleteSession()`** | Branch management: named branches, parent tags, and deleting a Grotto session no longer orphans its Claude transcript. Only worth building *with* #35 — without branching there is exactly one Claude session per Grotto session. | `server/agent.ts` (`destroy`), `server/index.ts` | **M** |
| 37 | **Hooks (`PreToolUse` deterministic guardrails)** | "Never touch `.env`, never force-push" enforced in code rather than in a system prompt the model can rationalise past — a fail-closed tier that even bypasses `canUseTool`. | `server/agent.ts:302` (hooks close over mutable rule state — there is no `setHooks`), rule store shaped like `server/pins.ts`, `src/di/control.ts` | **L** |
| 38 | **`Options.agents` / `Options.agent`** | Operator-authored subagent dispatch, and a "send this hunk to \<agent\>" gesture in Changes. **Not** the Tasks backend. | `server/agent.ts:302`, `server/config.ts`, `src/di/screens/Changes.tsx` | **L** |
| 39 | **`applyFlagSettings()`** | Live effort changes with no query recycle — deletes the documented wart at `agent.ts:236-245` — plus an inspectable, revocable permissions allowlist UI. **Highest-footgun item in the audit**: top-level keys *replace*, so a partial `permissions` object silently widens privilege. | `server/agent.ts`, `server/index.ts`, `src/di/frontdoor/Settings.tsx` | **M** |
| 40 | **`mcpServerStatus()` + toggle/reconnect** | An MCP section in the existing Settings modal showing what connected, from what scope, and why it failed — with a Retry that retries. Empty by design once #13 lands, so build it as a *section*, never a screen. | `server/agent.ts`, `server/index.ts` (must strip `headers`/`env` — both can carry bearer tokens) | **M** |
| 41 | **`AskUserQuestion` card + `toolConfig.previewFormat: 'html'`** | Model-authored decision points render as a first-class question card with chip labels and rich previews. The one-line flag is 10% of it; the sandboxed renderer is the actual work. | `server/agent.ts:313`, `src/di/control.ts:190-197`, `Session.tsx` | **M** |
| 42 | **`onUserDialog` + `supportedDialogKinds`** | Model-refusal fallback prompts stop dead-ending invisibly. Thin payoff — the only kind named in the types is `refusal_fallback_prompt`. The valuable half (honouring `retracted_message_uuids`) is already folded into #26 and should ship first, alone. | `server/agent.ts`, `server/index.ts`, `Session.tsx` | **M** |
| 43 | **`reloadPlugins()` / `reloadSkills()`** | Edit a SKILL.md → review it in Changes → Keep → reload → next turn runs the reviewed skill. Genuinely DI-shaped, but inert for the general case (most cloned repos ship no plugin). Manual button first — auto-trigger requires parsing `file_path` out of tool-event input JSON, which is real work. | `server/agent.ts`, `server/index.ts`, `src/di/frontdoor/Settings.tsx` | **S** |
| 44 | **`agentProgressSummaries` + `forwardSubagentText`** | An expandable "show subagent work" drawer for the drill-in-only-when-suspicious workflow. Both add load to the reconnect path a phone-first product depends on; both belong behind a per-session setting, default off. | `server/agent.ts`, both folds, `src/di/state.ts` (`children[]`) | **M** |
| 45 | **`readFile()` (SDK path) + `seedReadState()`** | Binary/image preview and a "view as the agent sees it" mode. **The actual `WIRING_STATUS.md:84` fix is client wiring** — `Files.tsx`'s no-op `onOpen` → the already-shipping `GET …/file`. The SDK path is a secondary upgrade only. | `src/di/screens/Files.tsx`, `server/files.ts`, `server/agent.ts` | **M** |
| 46 | **`outputFormat` (side query)** | Structured review verdicts / generated TaskManifests. **Blocked on the task runner** — shipping manifest generation before the runner turns an honestly-labelled SAMPLE screen into one that looks live and does nothing. | new `server/sidequery.ts` | **M** |

---

## Spikes that gate the big items

These are cheap measurements that must land *before* the L-effort work is scheduled. Every one of them is an untyped assumption the SDK does not document:

1. **Does the CLI emit an `SDKUserMessageReplay` for every pushed user message?** `isReplay` appears exactly once in `sdk.d.ts` with no doc. Cheaper alternative to probe first: stamp our *own* `SDKUserMessage.uuid` and skip the replay-catch entirely. — *gates #23*
2. **Do file checkpoints survive `resume` and a `setEffort` recycle?** DI always passes `resume:` and rebuilds the query on every effort change and server restart. If they don't, the rewindable window is one query lifetime and most historical turns render inert. — *gates #23*
3. **Does `ExitPlanMode` route through `canUseTool`?** Nothing in `sdk.d.ts` or `sdk-tools.d.ts` says it does. The entire plan-approval card design hangs on this. — *gates #24*
4. **Does `maxBudgetUsd` accumulate conversation-wide or per-turn?** DI's query is long-lived across many turns. Also confirm the re-breach footgun: a breached session resumes with the same cap and re-breaches on the very next message, so the stop card must offer "raise budget". — *gates #8's UI copy*
5. **Do programmatic hooks merge with or shadow settings-file hooks?** `settingSources: ["user","project"]` is what keeps caveman and RTK in the loop. Verify with `includeHookEvents` before shipping #37.
6. **Does `applyFlagSettings({ effortLevel })` actually override the creation-time option?** The precedence doc orders the flag layer against user/project/managed and says nothing about `query()` options. Do not delete the recycle path on assumption. — *gates #39*
7. **Does the CLI emit task messages unconditionally?** The union defines them; nothing says they're always emitted. — *gates #25*
8. **Is the Railway service's `CLAUDE_CONFIG_DIR` volume actually mounted?** `Dockerfile:15-16` and `docker-entrypoint.sh:15-51` provision it — confirm in the live service. If yes, `sessionStore` is permanently off the table.

---

## Honest about the hard ones

- **#23 Rewind is L, not M, and may disappoint.** Shipping it honestly needs two spikes, a new event kind, a route, transcript UI, a synthetic-notice path (the post-rewind notice must **not** go through `send()` — that emits a fake human bubble which `server/search.ts` then indexes for ⌘K), and per-turn enable/disable driven by `dryRun`. Expect most historical turns to render inert. The transcript does **not** rewind with the files; there is no counterpart in the SDK.
- **#35 Fork has a blocking design decision, not a risk.** Nothing about the *workspace* is forked — both branches share `this.dir`. Either one-active-branch-at-a-time (simple, honest, M) or worktree-per-branch (real isolation, L+ and a new files/preview/diff story). Also: forked sessions start **without undo history**, so any combined flow must be rewind-*then*-fork. And forking rewrites our JSONL, which retroactively changes ⌘K search results — unaddressed anywhere.
- **#26 stream handling is L.** ~8 new message cases plus a client-side transcript-identity change plus the duplication fix from #4. Provisional `content_block_start` cards must reconcile by block id or fast turns double-render every tool — the same bug class as the text duplication, so fix identity once for both.
- **#39 `applyFlagSettings` is the highest blast radius in the audit.** It accepts any `Settings` key including `permissions` and `hooks`, top-level keys *replace* rather than merge, and there is an unresolved double-query hazard: `setEffort()` nulls `this.q` and interrupts, but `inputs()` never returns — if `interrupt()` doesn't terminate the generator, two CLI subprocesses race for the same shared input queue. **Item #1 must land first.**
- **#37 Hooks are on the hot path.** Set `timeout` on every matcher. `FileChanged` is **not** a free push feed — `watchPaths` must be registered from a `SessionStart` hook first, or it silently never fires. And a `PreToolUse` deny is invisible to both `canUseTool` *and* `SDKPermissionDeniedMessage`, so it must be surfaced from the hook itself or the agent appears to stall.
- **#18 `acceptEdits` has a review-first hole.** It removes edits from `canUseTool` entirely, so DI's transcript silently loses the record that an edit was approved — same problem as `auto`, needs the same fix (surface auto-approved edits as transcript rows). And `acceptEdits` auto-approvals produce **no message on any channel**, so an "approved silently" count has no SDK source and must not be invented.
- **`NonNullableUsage` is a type-level lie.** It strips `| null` at the type level only. `msg.usage.output_tokens_details.thinking_tokens` type-checks clean and throws at runtime; the obvious cache ratio yields `NaN`. Coalesce every field in #6.
- **`total_cost_usd` is meaningless on subscription auth**, and `AccountInfo.subscriptionType` is a bare `string`, not the union the docs' prose implies. Gate dollar tiles on `apiProvider === 'firstParty'`, and render the subscription string without switching on literals.

---

## Do NOT do

| Thing | Why |
|---|---|
| **`Query.streamInput()`** | Two producers on one stdin with no documented ordering contract, and the problem it solves disappears entirely once item #1 lands. Recorded as rejected so it isn't revisited. |
| **`Options.continue`** | We store the exact session id and pass `resume:`. `continue` is mutually exclusive with `resume` and would silently attach to the wrong conversation once one workspace holds multiple sessions — i.e. the moment branching ships. |
| **`Options.sessionStore` / `persistSession`** | @alpha on every member, dual-write of opaque CLI-internal blobs, and it cannot replace our JSONL (which is a *projection* we author — our seq, our labels, our replay window, our ⌘K index). Its only real benefit is durability, and the deploy already has the cheaper answer: a volume-backed `CLAUDE_CONFIG_DIR`. |
| **`bypassPermissions` / `allowDangerouslySkipPermissions`** | A review-first IDE has no legitimate use for a mode that removes the human. Never expose it in the permission pill; ship the *lock* (#14) instead. |
| **Wire `rewindFiles` to per-hunk Revert** | It reverts everything the agent touched since a user message. A button labelled "Revert" on a hunk row doing something far larger is precisely the mislabel `WIRING_STATUS.md` exists to prevent. |
| **Hang rewind or fork off the Session timeline** | That timeline is `git log`. A reviewer would tap a commit and get a rewind to an unrelated chat turn. |
| **`Options.plugins` auto-probed from cloned repos** | Loading a plugin from a freshly cloned untrusted repo **executes that repo's hooks**. Given DI's core loop is "clone a repo you are about to review", auto-discovery is close to the worst possible default. Operator allowlist only. |
| **`skills: 'all'` as a default** | The SDK deliberately declines to state what the CLI default is, so this is a behaviour change away from an unknown baseline for no measured gain. Also risks silently disabling caveman on a name mismatch. |
| **Opt into `betas: ['context-1m-2025-08-07']`** | Sonnet-4/4.5 only while DI lets users switch models freely, no live path to follow a switch, and it changes billing so cost tiles stop being comparable. **Read** `msg.betas` back (free, one line); don't opt in. |
| **`reinitialize()` on WebSocket reconnect** | The transport gap it repairs is DI-server ↔ CLI-subprocess. DI's WebSocket is browser ↔ DI-server, and `attach()` already replays the pending approval. It would fire a control request on every phone reconnect for zero benefit — and reintroduce a double-dispatch hazard against the single-slot `this.pending`. |
| **`setMcpPermissionModeOverride()`** | Silently inert under DI's `permissionMode: 'default'`. Shipping the toggle creates exactly the cosmetic placeholder we're trying to eliminate. |
| **`outputFormat` with `permissionMode: 'plan'`** | Plan mode steers toward ExitPlanMode, which fights a `json_schema` final result. Use default mode with empty `allowedTools` and/or `maxTurns: 1`. |
| **Flip `SAMPLE.tasks` to false** | The runbook runner is still unbuilt (`WIRING_STATUS.md §C-11`). Add a *distinct* live section; never dress seed data as real. |
| **`Options.tools` as well as `disallowedTools`** | Pick one for the posture feature. `disallowedTools` is subtractive with less blast radius and no skill-compatibility hazard (restricting `tools` removes tools that settings-loaded caveman/RTK skills assume exist). |
| **`taskBudget`** | @alpha, dated beta header, unmeasured benefit, and it competes for attention with `maxBudgetUsd` which does the same job with certainty. |
| **Route hook stdout/stderr, file contents, or account PII through `emit()`** | `emit()` appends to the JSONL that `server/search.ts` indexes for ⌘K. Anything sensitive or high-volume goes on `broadcast()` only. |