# Design integration — turns 43–49

Status of the Claude Design return (`Grotto_IDE_UX_design_3`, `NEW_SURFACES.md`,
turns 43–49) against the code.

**Tokens came back identical** to `src/di/tokens.css`, so nothing below is a
token migration — it is layout, hierarchy, copy and states.

## What landed

| Option | Surface | Where |
|---|---|---|
| 43a–43d | Leash: rope gauge, ordered ladder, posture readout, review-only guarantee, merged `model · effort` chip | `screens/Session.tsx` → `LeashPill`, `RopeGauge`, `RunChip`, `BrakeRow`, `Toggle` |
| 44a | New session: workspace card + satellites, "Work here instead", ghosted branch, pre-flight leash | `frontdoor/SessionsHome.tsx` → `SetupModal`, `BranchField`, `PreflightLeash` |
| 44b/44c | Repositories: clone progress with elapsed, failed-clone retry, removal confirm with blast radius | `Shell.tsx` → `ReposSection` |
| 44d | Session cards: no hover, satellites on a second line that expands in place | `frontdoor/SessionsHome.tsx` |
| 44e | Files: repo chip strip, one tree at a time, find-across-repos, Elsewhere | `screens/Files.tsx` → `FindResults` |
| 44f | Changes: per-branch rail with counts, commit pre-flight with live per-repo state | `screens/Changes.tsx` → `BranchRail`, `CommitDock` |
| 45a/45b | Rewind: full-column receipt, three figures, folder rollup, no-checkpoint slate | `screens/Session.tsx` → `UserBubble`, `Figure`, `FileRollup` |
| 45c | System register: needs-you vs happened | `screens/Session.tsx` → `SystemNeedsYou`, `SystemHappened` |
| 46a | Context meter, 85% register change, plan window as its own card | `screens/Session.tsx` → `ContextMeter` |
| 46b | Hooks: one row each, event + exit on the face | `screens/Session.tsx` → `HookLiveness` |
| 46c | Tasks: two registers, labelled divider, SAMPLE on the palette only | `screens/Tasks.tsx` → `InFlight`, `RegisterDivider` |
| 46d | Diagnostics as a troubleshooting surface, Copy all | `frontdoor/Settings.tsx` → `ClaudeCodeDetail`, `DiagRow` |
| 47a | Chips split by sends-vs-fills; argument commands return | `screens/Session.tsx` → `CommandChip`, `pickStarters` |
| 47b | Thinking as rising bars; provisional → settled in a fixed box | `screens/Session.tsx`, `di.css` (`di-rise`, `di-settle`, `di-shim`) |
| 47c | Both brakes under one heading | `screens/Session.tsx` → `LeashPill` |
| 49a–49e | Cold, offline, the two empties, Files header | across the above |

## The five "still open for engineering" questions, answered

1. **Arbitrary category strings in the context meter.** Done. The legend
   renders whatever list the CLI returns and colours it **by position** from a
   six-tint ramp — never by matching names we would have to keep in step with
   the CLI. Live sessions here return `Free space`, `Autocompact buffer`,
   `System tools`, `System tools (deferred)`, none of which were in the mock.

2. **Per-repo progress events for the 44f pre-flight.** Done, client-side.
   `commitSync` already had to run sequentially, so it now publishes a
   `Record<repoName, "waiting" | "pushing" | "done" | "failed">` as it goes and
   stops the queue on the first failure — which is exactly what the pre-flight
   promises in words. No new server endpoint was needed.

3. **Rewind dry-run folder rollup.** Not needed from the server. `rewindFiles`
   already returns the full `filesChanged` array; the rollup is a fold over it,
   so the fold lives in `FileRollup` and "See all N" is a state change rather
   than a second request.

4. **Argument hints in `supportedCommands()`.** Already there — the SDK's
   `SlashCommand` carries `argumentHint`, and `toCommands()` keeps it. Measured
   on a live session: **17 of 51** commands have one.

   This one bit. A plain `slice(0, 6)` over the CLI's list returned six
   argument-less skills, so the dashed "fills the box" chip never rendered and
   the distinction 47a exists to draw was invisible. `pickStarters()` now
   reserves places for both shapes while keeping CLI order within each.

5. **Stable identity for the provisional tool card.** Already there. The
   streaming `content_block_start` and the durable event carry the same
   `toolUseId`, so the card is replaced in place and the 180ms settle is a
   transition rather than a remount.

## Deliberately not built

Per §9.3 of the requirements and the design's own answers:

- **A plan-approval card.** Measured: `canUseTool` is never invoked in plan
  mode, so there is nothing to approve against.
- **Any "% context saved" figure.** No counterfactual exists in the SDK.
- **A bypass-permissions escape hatch.**
- **Fork / branch UI.** `forkSession()` does not fork the workspace.
- **A git-stash counter-undo for rewind.** The design says "there is no undo
  for this" and the card says it too.

## Sample data

Repo names, emails and timestamps in the canvases are illustrative. The one
piece of sample-marked product UI is the `SAMPLE` chip on the Tasks runbook
palette, which stays until the runbook backend is real — it has moved off the
screen title and onto the palette, because the live section above it is not
sample.
