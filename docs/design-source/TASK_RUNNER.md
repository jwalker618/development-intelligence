# Tasks — the task runner (Development Intelligence)

Source of truth: **`uploads/taskrunnerdesign.md`** (design note). This file is the UI contract
DI must render. Screen: **35e** in the design reference.

## Reframe
Almost everything typed into a terminal is a small set of recurring runbooks. Make **those**
first-class: parameterised, saved, named **tasks** with buttons, safe secret handling and
confirmation gates. The task runner is the **primary** surface; a raw **Term** tab stays only
as the escape hatch (rail dock). Tasks are the **deterministic** counterpart to the agent —
routine ops run without spending model tokens.

## A task is a manifest → the UI renders from these fields
`name · description · destructive · confirm{challenge,expect} · setup[] (provision/auth, cached
once per container) · params{} · env{} (secret refs) · run[]`.

### Param type → control (must provide)
| type | control |
|------|---------|
| string | text field |
| int / number | number field + stepper, validated |
| bool | toggle |
| enum | segmented control / select |
| secret-ref | **not an input** — a locked chip "🔒 from DI secrets", value never shown |

## Screens
1. **Task palette** (home) — per-session tasks, grouped + searchable, each a **Run**; empty
   state teaches "save a runbook as a task"; Run reachable in the bottom half (one-thumb).
2. **Task detail → param form** — typed controls, defaults pre-filled, inline validation;
   **setup status** inline (`railway authed · container ready` / "connect needed" → guided flow);
   primary **Run**, or **Review & run** for destructive.
3. **Confirm gate** (destructive only) — a distinct screen, not a dialog. See below.
4. **Run view** — streaming output; status running/failed/done; **Interrupt**; **survives a
   dropped socket** (reconnect into the running task); **secrets redacted** in the stream; a
   step that prompts renders a **structured question card** (Allow/Deny), never a raw TUI;
   output retained after completion.
5. **Setup / guided auth** — reuse the guided Claude-connect pattern (device-code URL → complete
   in browser → "authed ✓"); runs once; state persists on the volume.
6. **Save-as-task** — promote a run (or an agent's proposed command) into a named task: inline
   values → params, inline secrets → refs.

**Every surface covers these states:** not-provisioned · ready · running · awaiting-input
(structured prompt) · awaiting-confirm · succeeded · failed · disconnected/reconnecting.

## Destructive confirm gate (brand rule)
- A **typed challenge** (`confirm.expect`): the user types the target name / an explicit "I
  understand this resets ~10k rows." The runner **refuses to proceed** without a match —
  deliberately phone-safe (a fat-finger can't wipe).
- **Plain prose, never caveman voice.** State exactly what will be destroyed.
- Show **what will run** (resolved command, secrets masked, params filled) *before* the gate —
  review-first applied to execution.

## MUST / MUST NOT
- **MUST** render destructive/security copy in plain prose; never show a resolved **secret
  value** (locked chips only; redact in output); design **one-thumb** (Run + confirm in the
  bottom half); make the run view **interruptible and reconnect-safe**.
- **MUST NOT** make a raw always-on TUI the primary surface (Term is a separate escape hatch);
  surface interactive auth or mid-run prompts as raw terminal text (structured cards only).

## Surface fit
- **PWA** — full palette / form / run view. Phone-first, primary target.
- **IDE** — a native DI **task tree view** (sibling of Changes/Review); quick-pick or webview
  param form; runs via the control plane. VS Code `tasks.json` is insufficient (no typed
  params, secret refs, destructive gate, reconnect-safe streaming) — DI builds its own and can
  **export** to `tasks.json` for compatibility, not depend on it.
- **Agent** — tasks exposed as an MCP tool (`run_task`): the Claude Code panel can invoke them
  ("seed the DSI backend with 10k in-network") → agent fills params → **still stops at the
  confirm gate**.

## Build order
1. Saved scripts + Run button (palette + run view) — MVP.
2. Typed manifests — param forms, secret refs, confirm gates, setup/run split — the core.
3. Agent-authored / agent-invocable — save-as-task + `run_task` — falls out cheaply.
