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

## What's real vs. mocked
Fully built and interactive: shell + view switching, all five rail themes,
caveman verbosity dial, per-hunk Keep/Revert/Tighten, Files pin toggle, Preview
viewport switch + runtime→agent, Tasks param form + destructive confirm gate
(typed challenge, masked secrets, plain-prose warning).

**Not yet wired (next phase):** the live control plane. The screens read from
`seedState`; connect them to the server (`server/`) sessions/changes/caveman/
tasks endpoints and the WS event stream. The official Claude Code panel in the
Session screen is a placeholder for where `anthropic.claude-code` docks in the
IDE surface; on the PWA it will be the control-plane chat.

**Phone-responsive:** the shell is drawn at the reference's desktop proportions
(340px rail + main). A phone breakpoint that collapses the rail into a drawer
is a follow-up — the reference canvas only draws the desktop shell for these
five screens.

## Legacy
The Grotto-era PWA (`src/App.tsx`, `src/components/*`, `src/ui.tsx`,
`src/styles.css`) is superseded by this module and no longer rendered
(`src/main.tsx` mounts `DIApp`). It's retained until the control-plane wiring
lands (some server-contract types in `src/api.ts` will be reused), then removed.
