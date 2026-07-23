> **Repo note:** this product now lives in `jwalker618/development-intelligence` (migrated out of generate-web). Product name: **Development Intelligence** — "Grotto" in older sections below is the same product's prototype name.

# Grotto — UX Design Specification

**Audience: Claude Design.** This document is the canonical design source for
`apps/grotto` — the equivalent of what `lens/` is for DSI. Grotto has no
`lens/` sources; design screens from this spec. The current implementation in
`src/` is a functional MVP whose *behavior contracts* are fixed but whose
*visual and interaction design* is yours to elevate. Sections marked
**CONTRACT** must survive any redesign; everything else is a starting point,
not a constraint.

---

## 1. Product story

Grotto is a mobile-first web IDE for **agent-driven vibe-coding**. The user's
development happens through an AI agent (Claude Code) running in a persistent
terminal inside a provisioned cloud environment (caveman + RTK token-economy
stack baked in). The phone is a *viewport onto that environment* — the user
prompts, reviews, approves, syncs, and previews. They rarely type code.

**The one-sentence brief:** make a phone feel like a calm, confident place to
direct an AI pair-programmer — not like a shrunken desktop IDE.

### Design principles

1. **Agent-first, terminal-second.** The primary verb is *prompting*, not
   typing into a shell. The composer is the hero input; the raw terminal is
   the agent's workbench the user watches.
2. **The client is a viewport.** All intelligence (compression, context,
   diffs, approvals) lives server/agent-side. Never design UI that re-implements
   the agent's judgment — design UI that *surfaces* it.
3. **Interruptible by design.** Phones lock, sockets drop, users switch apps
   mid-run. Every screen must communicate "your session is still alive" and
   recover into a coherent state without user effort.
4. **One thumb.** Every frequent action reachable in the bottom half of the
   screen. Destructive or rare actions may live at the top.
5. **Token economy is a feature, not plumbing.** Savings, modes, and context
   cost are brand moments — surface them with pride (the caveman badge, the
   token estimate), never as debug noise.

### Brand

Cave/caveman identity, shared with the caveman project: rock emoji `🪨`,
warm darkness, a single confident orange. Copy may use light caveman voice in
celebratory/empty moments ("Enter the cave", "Old rocks heavy — put down")
but **never** for errors, security, or destructive confirmations — those are
plain, clear prose (this mirrors caveman's own auto-clarity rule).

Current placeholder tokens (free to evolve; keep dark-first and the orange
accent family):

| Token | Value | Role |
|---|---|---|
| `--bg` | `#12100e` | App background (near-black, warm) |
| `--panel` | `#1c1917` | Bars, cards |
| `--panel-2` | `#292524` | Raised controls |
| `--border` | `#3b352f` | Hairlines |
| `--text` | `#e7e5e4` | Primary text |
| `--muted` | `#a8a29e` | Secondary text |
| `--accent` | `#f97316` | The orange — actions, caveman badge, pins |
| `--accent-dim` | `#9a3412` | Pressed/outline states |
| `--danger` | `#ef4444` | Destructive |
| `--ok` | `#22c55e` | Success/additions |

Type: system sans for UI, `ui-monospace` for terminal/code/badges. Dark theme
only for v1 (terminal-adjacent products read better dark; light theme is a
later variant).

---

## 2. Information architecture

```
Login ─▶ Home ─▶ Session ──┬── Agent   (default tab)
                           ├── Files
                           ├── Git
                           └── Preview
```

- **CONTRACT:** Session is one screen with four tabs; the Agent tab's
  terminal stays mounted (socket + scroll position preserved) while other
  tabs show. Navigation is Login → Home → Session and back; no deeper stack.
- Bottom tab bar for the session tabs (thumb rule). Home ↔ Session uses a
  back affordance in the top bar.

---

## 3. Screens

### 3.1 Login

**Purpose:** authenticate this device once. Sets tone — this is the front door.

- Single centered card: brand mark, one password field, one primary button.
- Current copy: title "Grotto", helper "A cave for vibe-coding. Paste the
  token printed by the Grotto server.", CTA "Enter the cave".
- **Two-step when MFA is on:** submitting a valid token reveals a 6-digit
  code field (`one-time-code` autocomplete, numeric keyboard) — design the
  reveal as a continuation, not an error. Wrong/reused codes and throttling
  ("too many attempts") surface inline.
- States: empty (CTA disabled), filled, busy, code-step, error.
- **CONTRACT:** login exchanges the master token (+ code) for a revocable
  30-day device credential — only that credential persists on the device.
  No username, no signup. Sign out (Home) revokes the credential server-side.

### 3.2 Home

**Purpose:** start or resume a session in under 5 seconds.

Regions, top to bottom:
1. **Top bar** — brand, sign-out.
2. **New session card** — repo picker (configured list + free entry,
   `owner/repo`), optional branch field ("created if missing"), primary CTA.
   - Busy state is important: cloning takes 5–60s. Current label "Cloning…";
     design a proper progress moment (indeterminate is fine — no fake
     percentages).
3. **Claude auth card** — collapsed by default: title, status line
   ("long-lived token stored ✓" / "token from environment ✓" / "interactive
   login (or none)"), and a Manage toggle revealing a paste field for a
   `claude setup-token` value plus a remove action. **CONTRACT:** the token
   is write-only — the UI shows presence/source, never the value.
4. **Security card** — collapsed: title, status ("authenticator MFA on ✓" /
   "MFA off"), Manage toggle. Expanded flows: enroll (explain consequence →
   "Open in Authenticator" `otpauth://` link + manual secret + confirm-code
   input) and disable (requires a current code; destructive styling).
   **CONTRACT:** enrollment is on-phone via `otpauth://` link (no QR — you
   can't scan the screen you're holding); enabling MFA stops the master token
   from authorizing anything on its own.
5. **Sessions list** — live sessions as cards: repo, branch, liveness
   ("shell live" / "idle"), setup state ("setup running/failed"). Tap opens;
   `✕` destroys (destroys the *workspace* — deserves a confirm in redesign;
   the MVP lacks one).

States: no repos configured (explain `GROTTO_REPOS`), no sessions (quiet empty
line), error banner (auth failure offers re-enter token).

**CONTRACT:** session cards must show liveness and setup state; create must
tolerate a long-running clone without the user thinking it hung.

> **FIELD RULING (v2.0 — CHAT-FIRST, supersedes v1.1's terminal-only ruling for
> the agent surface):** driving Claude Code's full-screen TUI through a phone
> terminal failed in the field (login screens, trust dialogs, wrapped URLs,
> keyboard-vs-scroll fights). The primary agent surface is now a **native
> chat**: the server runs Claude Code **headlessly via the official Agent SDK**
> (`server/agent.ts` — one `AgentChat` per session, event log on the volume,
> WS stream) and the client renders structured events (`Chat.tsx`) — user/
> assistant bubbles, collapsed tool cards (name + summary, tap to expand
> input/output), a **pinned approval card with Allow / Always / Deny buttons**
> (SDK `canUseTool`), streaming text deltas, a stop button, and a result line
> (duration/cost). Model switching goes through the same sheet but calls
> `POST /chat/model` (SDK `setModel`). Headless sessions never show login,
> onboarding, or trust TUIs; auth is the stored subscription token injected as
> `CLAUDE_CODE_OAUTH_TOKEN`. Caveman + RTK still apply — the SDK loads the
> same CLAUDE_CONFIG_DIR settings/hooks (`settingSources: ['user','project']`),
> so replies arrive compressed and the savings pill keeps working. The tab
> order is **Agent (chat) · Term · Files · Git · Preview**: the terminal
> remains, one tab over, for shell work and TUIs — it is no longer the way
> you talk to the agent. Files-tab @mentions insert into the chat draft.
> WS `/api/sessions/:id/chat` (server→client frames: hello, event, delta,
> status, approval_cleared); REST `POST /chat/{message,approval,interrupt,
> model}`. A pending chat approval marks the session "needs you" in the
> control room exactly like a TUI dialog.

> **FIELD RULING (v1.1, supersedes the composer spec below — NOTE: v2.0 above
> supersedes this for the agent surface; it still governs the Term tab):** the agent tab is
> **terminal-only**. The composer dock and the approval overlay were removed
> after real phone use — the touch-typable terminal is the sole input.
> Retained: the chips strip (one-tap commands), the terminal-keys row with
> ✓1/✓✓2/✗3 approval keys, "Type here" focus, and a **Links** sheet that
> collects URLs from the terminal buffer (full URL, Open + Copy) — isolating
> links from TUI rendering instead of relying on inline click regions. File
> references from the Files tab type `@path` (or `@path lines a–b`) directly
> into the terminal. Design future iterations from this baseline.

> **FIELD RULING (v1.2 — guided Claude connect):** Claude subscription login
> is a **dedicated procedural modal**, never a terminal flow. The server runs
> `claude setup-token` in a hidden 400-column PTY (`server/claude-auth.ts`);
> the client (`ClaudeConnect.tsx`) walks three numbered steps — **1 Authorize**
> (Open claude.ai button + copy-link, URL extracted server-side so it can
> never wrap or truncate), **2 Paste the code** (a normal form field — native
> paste always works), **3 Connected** (token auto-captured from the CLI
> output and stored write-only on the volume). Error state shows the CLI tail
> and a Start over. Entry points: a `Connect Claude` chip that leads the
> chips strip while no token is stored, and Settings → Claude authentication
> → "Connect Claude (guided)". The Links-sheet/Paste-pill terminal route
> remains only as a generic capability for other TUIs, not the auth path.
> API: `GET /api/claude-auth`, `POST /api/claude-auth/{start,code,cancel}` —
> status is `{state: idle|starting|awaiting-code|verifying|done|error, url,
> detail, tail}`; the token value never crosses the API.

### 3.3 Session — Agent tab (the hero screen)

**Purpose:** watch the agent work; steer it. 80% of time is spent here.

Vertical anatomy (current order, keep the composer adjacent to the keyboard):

1. **Top bar** — back, `repo · branch` (truncating), **caveman badge** (see
   3.6).
2. **Terminal** — xterm.js surface, fills remaining height. Dark, 13px mono,
   orange cursor. Output is caveman-compressed by the environment, so lines
   are short — design for dense, terse content.
   - Reconnect behavior (**CONTRACT**): on every (re)connect the screen
     clears and ~200 KB of scrollback replays, then live output resumes. On
     shell exit a line invites "press any key to restart".
3. **Key bar** — horizontally scrollable single row:
   `Esc Tab ^C ↑ ↓ ← → ⏎` │ divider │ `✓ 1  ✓✓ 2  ✗ 3`.
   - The approval group answers Claude Code's numbered permission dialogs
     (1 = approve, 2 = approve always, 3 = reject). It is the product's
     answer to "granular approval on mobile" — make it feel like a first-class
     approve/reject control, visually distinct (accent-outlined today).
     Outside a dialog the keys just type digits — harmless, but a redesign
     may explore showing the group only when a dialog is likely on screen
     (heuristic; the client has no structured signal — **do not** invent a
     protocol, see principle 2).
4. **Chips row** — one-tap commands: `claude`, `gemini`, `/caveman`,
   `/caveman ultra`, `/caveman-stats`, `/caveman-prune`, `git status`.
   Horizontally scrollable; think "speed dial for the agent".
5. **Pins row** (only when pins exist) — pinned-file chips (`📌 name ✕`) +
   live estimate `~2.1k tok context`. Tapping a chip unpins.
6. **Composer** — native `<textarea>` + Send. **CONTRACT:** must remain a
   native text input (OS autocorrect/swipe/dictation are the point). Enter
   sends; Shift+Enter newlines. Sending prepends pinned files as `@path`
   mentions.

Design tensions to solve well:
- Terminal height vs. keyboard: when the keyboard opens, the terminal
  shrinks (`interactive-widget=resizes-content`); the composer must stay
  glued above the keyboard, and the most recent terminal lines visible.
- The terminal is also *touchable* (taps focus it, xterm shows its own
  keyboard input) — but the composer is the promoted path. Keep that
  hierarchy visually obvious.

### 3.4 Session — Files tab

**Purpose:** browse the checkout; occasional direct edits; uploads; pinning.

- **Toolbar:** breadcrumb (root / segment / segment) + actions:
  `⬆ Upload`, `＋ File`, `＋ Folder`.
- **Listing:** dirs first, then files; each row: icon + name, `📌` pin toggle
  (files only; lit = pinned, currently an orange glow), `⋯` opening a row of
  `Rename / Move` and `Delete` (delete confirms).
- **Editor:** opens in-place of the listing. Header: back-to-dir, path,
  pin toggle, Save (disabled until dirty; "Saved" when clean). Body: plain
  monospace textarea. Binary files show a notice; >512 KB read-only.
- Uploads land in the current directory; multiple files allowed. Primary use
  case to honor in the design: **screenshots destined for the agent** —
  consider making "upload → pin → prompt about it" feel like one flow.
- MVP uses `window.prompt/confirm` for naming and deletes — replace with
  proper sheets/dialogs in the redesign.

**CONTRACT:** operations are jailed to the workspace; the editor is a
secondary path (agent edits files; humans nudge). Don't grow this into a
desktop file manager.

### 3.5 Session — Git tab

**Purpose:** ship without CLI. One-tap sync, inspect diffs, time-travel.

Top to bottom:
1. **Branch line** — `🌿 branch`, `↑ahead ↓behind`, refresh.
2. **Changes** — one row per changed file (`status code` + path), tap → diff
   view (full-screen takeover like the editor): green additions, red
   deletions, orange hunk headers, horizontal scroll. "View full diff" for
   everything. Untracked files diff as new-file.
3. **Sync block** — hero action `⚡ Sync (commit · pull · push)`; beneath it a
   message field ("blank = auto-generated") and secondary `Commit all / Push /
   Pull`. Auto-message is deterministic (`sync: 3 files — a, b, c`) — zero
   tokens spent.
4. **Op output** — last command's git output in a quiet mono block.
5. **History timeline** — last 50 commits: `sha subject relative-time`.
   Tapping any non-HEAD commit offers **reset workspace to this commit**
   (confirm explains: uncommitted changes lost; pushed-past commits need a
   force push from the Agent tab). Style as a timeline — this is the "visual
   state reversion" feature; make the current position and the consequence of
   tapping unmistakable.

**CONTRACT:** Sync stays one tap; reset stays behind an explicit,
consequence-stating confirmation; auto-messages stay deterministic.

### 3.5b Model pill (top bar of Session)

Next to the caveman badge: a tappable mono pill showing the Claude model the
session's agent is running (e.g. "Sonnet 4.5"), reported by a statusline
wrapper the environment installs — **CONTRACT:** the pill mirrors what the
agent reports, never client guesses; empty state reads "model ?" until the
first claude session starts. Tapping opens a sheet of model choices
(Sonnet / Opus / Haiku / Default / custom id) that sends `/model <alias>` to
the PTY — switching stays agent-owned.

### 3.6 Caveman badge (persistent, top bar of Session)

Reads the same flag files as the terminal statusline. Renders:
- Off/not installed → quiet muted "caveman off".
- Active → `[CAVEMAN]` or `[CAVEMAN:ULTRA]` in accent orange + lifetime
  savings suffix when present: `⛏ 12.4k`.

**CONTRACT:** the badge mirrors the flag file — it never invents state. It's
a brand moment; polls ~15s, so no need to animate transitions aggressively.

### 3.7 Session — Preview tab

**Purpose:** see the app the agent is building, live.

- **Preview bar:** port field (numeric, remembered per session), `Load /
  Reload`, `Open ↗` (new tab).
- **Empty state:** instructional — "Start a dev server in the Agent tab
  (e.g. ask the agent to run `pnpm dev`), then load its port here." Mention
  hot reload works.
- **Loaded:** full-bleed iframe (white background — previewed apps choose
  their own theme). HMR/hot-reload flows through automatically.
- **Failure:** dead port returns a friendly message ("Nothing is listening on
  127.0.0.1:5173 — start a dev server in the Agent tab first") — design this
  as a readable state, not a raw error page.

**CONTRACT:** port entry is manual (no port scanning); the proxy only reaches
localhost inside the session container.

---

## 4. Component inventory (shared vocabulary)

| Component | Where | States |
|---|---|---|
| Primary button `.btn.primary` | CTAs everywhere | default / pressed / disabled / busy-label |
| Secondary `.btn`, ghost `.btn.ghost`, danger `.btn.danger` | throughout | idem |
| Card `.card` | Home, Files, Git | — |
| Chip `.chip` | command chips, pins | default / pressed; pin variant carries ✕ |
| Key `.key` | key bar | default / pressed; `.approve` accent variant |
| Session row | Home | live / idle / setup-running / setup-failed |
| File row | Files | dir / file / pinned / actions-open |
| Diff line | Git | add / del / hunk / context |
| Timeline row | Git | current (disabled) / past (tappable) |
| Badge | top bar | off / active(mode) / active+savings |
| Error banner `.error` | all screens | with/without action |
| Empty states | Home, Files, Git, Preview | copy per 3.x |

Redesigns should keep this vocabulary (names/roles), not necessarily the CSS.

---

## 5. Ergonomics & platform rules

- Layout fills `100dvh`; respect `env(safe-area-inset-top/bottom)` (PWA runs
  standalone, `black-translucent` status bar).
- Bottom tab bar = session navigation; keep 44px+ touch targets everywhere.
- Horizontal overflow only inside designated scrollers (key bar, chips,
  diffs); the page never scrolls sideways.
- The keyboard resizes the layout (`interactive-widget=resizes-content`) —
  test every screen with keyboard open.
- PWA: installable via manifest (`🪨` identity, `#12100e` theme); no service
  worker yet (offline shell is roadmap).
- Performance: xterm is the heavy component; everything else must stay light.
  No blocking overlays over the terminal while output streams.

---

## 6. Data & behavior contracts (what the server guarantees)

For designing loading/error/latency states — full API in `README.md`:

| Interaction | Latency profile | Failure surface |
|---|---|---|
| Create session | 5–60s (clone) | error string (bad repo/branch/auth) |
| Terminal | streaming; reconnect replays scrollback | banner-free; the terminal itself shows exit/restart |
| File list/read/save | <300ms | inline error |
| Upload | seconds (32 MB cap) | inline error |
| Git status/diff/log | <500ms | inline error |
| Sync | 2–20s (network push) | 422 with git's own message (e.g. rebase conflict — advise Agent tab) |
| Reset | <1s | confirm-gated |
| Preview | instant proxy; target may be dead | friendly 502 text |
| Caveman badge | 15s poll | silently degrades to "off" |

Auth: one bearer token; a 401 anywhere means "re-enter token" — design a
single consistent recovery pattern.

---

## 7. Roadmap screens (design ahead of build)

1. **Notifications** — push/badge when a long agent run finishes or asks for
   approval while the app is backgrounded. Needs: permission ask moment,
   notification content, and a "jump back into the Agent tab" landing.
2. **Syntax-highlighted editor** (CodeMirror) — same Files flow, richer body.
3. **Approval surfacing** — evolution of the `✓1/✓✓2/✗3` keys: e.g. a
   floating approve/reject pill when a permission dialog is on screen.
   Constraint stands: no client-side re-implementation of the agent's
   diff/approval loop; the terminal remains the source of truth.
4. **Offline shell** — PWA opens offline to Home with cached session list and
   clear "reconnect" affordances.
5. **Multi-session switcher** — quick jump between live sessions (currently
   via Home).

Explicit non-goals (do not design): multi-user/team features, a client-side
diff-approval workflow separate from the terminal, desktop-first layouts
(desktop gets the responsive stretch of mobile, not its own paradigm).
