# `src/di` — the Development Intelligence PWA (turn-35 design)

This is the phone-first companion UI built to the Claude Design handoff
(`development/project/version/1/claude design.zip`; the design-source docs are
mirrored in `docs/design-source/`). The `.dc.html` canvas is the pixel
reference — recreated here in React, not copied.

## Layout
- `tokens.css` — canonical DI tokens (copied verbatim from the handoff; the
  five `[data-di-theme]` rail blocks live here).
- `di.css` — globals, utilities, interaction states, animations.
- `state.ts` — the session-state model (handoff §7) seeded with the reference
  data. **This is where the live control-plane wiring plugs in** — replace
  `seedState` with data from the server; the screens are already prop-driven.
- `primitives.tsx` — `Icon` (kebab→Lucide, synchronous static map), eyebrows.
- `Shell.tsx` — the one frame: coral flush-nav + view switcher + theme picker,
  340px theme rail base layer, `MainColumn` / `RailScroll` / `RailDock` helpers.
- `DIApp.tsx` — root: view + theme + session state, drives `[data-di-theme]`.
- `screens/` — the five turn-35 screens: `Session` (35a), `Changes` (35b, the
  review hero — semantic diff + per-hunk verdicts), `Files` (35c),
  `Preview` (35d), `Tasks` (35e, task runner + typed-challenge confirm gate).

## Control-plane wiring (live)
`control.ts` maps the server shapes → the DI view-model and holds the actions
(over `src/api.ts`, the existing client). `useControl.ts` bootstraps a session,
loads the live slices, subscribes to the chat WS (reconnecting), mirrors the
caveman flag on a ~15s poll, and surfaces a 401 as re-auth. `Login.tsx` is the
token+MFA gate and the 401 recovery surface.

**Live against the control plane:**
- **Session** — caveman dial writes `POST /api/caveman`; the Claude Code panel
  renders the folded chat WS event stream (user/agent/tool/approval), with an
  interactive Allow/Always/Deny card and a working composer
  (`chat/{message,approval,interrupt}`); timeline from `git/log`; model +
  busy/interrupt from the WS; the Caveman KPI shows the real savings suffix.
- **Changes** — the list is `git/status`; clicking a change loads the real
  `git/diff` (parsed into hunks); Commit & sync runs `POST …/git {op:"sync"}`.
- **Files** — the tree is `…/tree`.

**Still on sample data (no backend yet — see design §9; flagged in-UI with a
`SAMPLE` chip and centralised in `control.ts` `SAMPLE`):** RTK gain %, the
caveman *percent* (server gives a lifetime savings string, not a per-session
%), the **semantic span-diff** engine (line diff only until the
`document-intelligence` engine is wired — labelled "span engine not wired"),
**pins**, the **task runner**, and the **preview runtime bridge**. The Files
inline file view and per-hunk Revert-to-git are also next-phase.

The official Claude Code panel styling in Session is where `anthropic.claude-code`
docks in the IDE surface; on the PWA it is the control-plane chat (now live).

**Phone-responsive:** the shell is drawn at the reference's desktop proportions
(340px rail + main). A phone breakpoint that collapses the rail into a drawer
is a follow-up — the reference canvas only draws the desktop shell for these
five screens.

## Legacy
The Grotto-era PWA (`src/App.tsx`, `src/components/*`, `src/ui.tsx`,
`src/styles.css`) is superseded by this module and no longer rendered
(`src/main.tsx` mounts `DIApp`). It's retained until the control-plane wiring
lands (some server-contract types in `src/api.ts` will be reused), then removed.
