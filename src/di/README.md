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

## Front door (`frontdoor/`) — the layer that wraps the workbench

Built from the SURFACES pack (turns 36–42; `docs/design-source/SURFACES.md`).
`DIApp.tsx` now orchestrates: **Login → (Connect Claude if not connected) →
Sessions Home → Workbench**, with the nav dropdown for switching.

- `frontdoor/SignalCard.tsx` — the shared signal-motif auth shell (DI mark, rings, card).
- `frontdoor/Login.tsx` — token → MFA code → throttle → 401 re-auth (36e/38a-c), via `api.login`.
- `frontdoor/ConnectClaude.tsx` — guided connect (38d-g) via `/api/claude-auth/*` + manual token via `/api/claude-token`. **Adapted to the real `setup-token` backend**: you open the minted URL, authorize, and paste the code claude.ai returns (the mock 38d shows the reverse device-code direction; the account email/plan on 38e aren't fabricated since the server doesn't expose them).
- `frontdoor/SessionsHome.tsx` — launcher (37a/b): live repo search (`/api/repos`) + Continue grid (`/api/sessions`); new-session (37c-e) via `POST /api/sessions`. **Adapted**: base branch is a typed field (no list-branches endpoint) and provisioning is one indeterminate step (the server clones inside the POST).
- `Shell.tsx` nav dropdown (37f) — session quick-switch + New + the 5 views + All-sessions/Settings/Appearance; the flush-nav glyph swaps `square-arrow-out-down-right`↔`arrow-up-left` on open.

### Settings & states (SURFACES turns 37g, 39–42)
- `frontdoor/Settings.tsx` — the four-section modal (39a-e) from the nav gear:
  **Claude authentication** (status + reconnect + disconnect), **Security**
  (MFA enable/disable + sign out), **Diagnostics** (live `/api/doctor` health
  chain + `/api/doctor/repair`), **Appearance** (theme mode + the five rails).
- `frontdoor/CloseSession.tsx` — destructive close/delete confirm (37g) via
  `DELETE /api/sessions/:id`, reached from the nav dropdown's current session.
- **Empty/loading states (40):** Session — Claude-not-connected (40c) + empty
  chat with suggestion chips (40d); Changes — loading skeleton, clean tree
  (40e), no-file-selected (40f); Files — loading-tree skeleton (40h) + binary
  file (40g).
- **In-screen flows (41):** model picker (41a → `chat/model`), file **editor**
  with dirty/save (41b → `PUT …/file`, ⌘S), new file/folder/**upload** dialog
  (41c → `…/file`, `…/mkdir`, `…/upload`).
- **Preview (42):** honest **no-dev-server** default (42a) + server/port
  **picker** (42b); the device frame shows once a server is picked.
- Session id persists (`di.session`) so a refresh returns to the workbench.

**Still sample sub-states (not yet built):** Task run-view / structured-prompt
/ save-as-task (41d-f — no task backend), Preview rebuilding/crashed/runtime→
agent (42c-e — no runtime bridge), the MFA-enrol QR screen (39c — enable/disable
is wired; enrol is stubbed). These need the Phase-3 backends in
`WIRING_STATUS.md`.

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
  **Pins** are a live per-session store (`GET/POST/DELETE …/pins`, add via the
  rail's +, unpin via ×). **⌘K search** runs the live transcript search
  (`…/transcript/search?q=`) over the session's chat log.
- **Changes** — the list is `git/status`; clicking a change loads the live
  **semantic span-diff** (`…/git/diff/semantic`, `server/spandiff.ts`):
  token-level inline replace spans + first-class **Moved** blocks, with a plain
  `git/diff` fallback for files the span engine can't handle; Commit & sync runs
  `POST …/git {op:"sync"}`.
- **Files** — the tree is `…/tree`.

**Still on sample data (no backend yet — see design §9; flagged in-UI with a
`SAMPLE` chip and centralised in `control.ts` `SAMPLE`):** RTK gain %, the
caveman *percent* (server gives a lifetime savings string, not a per-session
%), the **task runner**, and the **preview runtime bridge**. The Files
per-hunk Revert-to-git is also next-phase.

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
