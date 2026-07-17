# Handoff: Grotto — Auth & MFA (new screens)

> Focused companion to **`README.md`** (the full Grotto handoff). This doc specs **only the new
> auth/security screens** added by the DESIGN.md revision, so they can be built as a self-contained
> workstream. Shared foundations (colour tokens, type scale, icons, motion) live in
> `README.md` → **Design tokens**; auth-specific values are restated here. Design reference:
> **`grotto-designs.html`**, options **`5a`** (login) and **`5b`** (settings/security).

## Overview

Login changes from "paste one bearer token" to a **two-step MFA flow** that trades the master
token (+ a 6-digit authenticator code, when MFA is on) for a **revocable 30-day device
credential** — only that credential persists on the device. Two account surfaces are added: a
**Claude authentication** card (write-only `setup-token` management) and a **Security** card (MFA
enrol/disable). Per DESIGN.md these are Home cards (§3.2, cards 3–4); because Home became the
concurrency **control room**, they live behind its **gear → Settings** in this design (trivially
collapsible back into Home).

**Fidelity:** high — recreate pixel-accurately in `apps/grotto` (React 19 + Vite). These are design
references, not code to ship. **Security copy is plain prose, never caveman voice** (brand rule).

---

## Screen 1 — Login (two-step MFA)  ·  `5a`  ·  DESIGN.md §3.1

Full-screen centred column, 28–32px gutters. **Shared atmospheric bg** on all steps:
`radial-gradient(120% 75% at 50% 112%, rgba(249,115,22,.16–.2), transparent 58%)` over
`linear-gradient(180deg,#0f0d0b,#15100c)` + inset vignette
`box-shadow: inset 0 0 120px 40px rgba(8,6,5,.8–.85)`.

### Step A — master token
- **Receding cave-arch tunnel** behind content: 4 nested arch outlines (`stroke #f97316`,
  opacity `.14 / .10 / .07 / .05`, `stroke-width 1.4→1.1`), each scaled about the bottom-centre
  (`0.74 / 0.5 / 0.3`).
- **Cave-arch mark** 76px, `filter: drop-shadow(0 0 26px rgba(249,115,22,.6))`.
- **Wordmark** "Grotto" — IBM Plex Sans `700 / 40px / -.02em`, `#f4efe5`.
- **Helper** (`#a8a29e`, 14/1.6, max 250px): "A cave for vibe-coding. Paste the token printed by
  the Grotto server."
- **Token field** — radius 14, `border #4a4038`, bg `rgba(16,14,12,.7)`, lock icon (`#6b645d`),
  **masked** dots (Mono 16, `letter-spacing .28em`, `#6b645d`). It's a password/secret input.
- **Primary CTA** "Enter the cave" — accent fill `#f97316`, text `#12100e`, `600/16`, radius 14,
  `box-shadow 0 6px 22px -6px rgba(249,115,22,.6)`, trailing arrow-right. Enter submits when
  non-empty; shows a **busy** label while exchanging.
- **Microcopy** (shield icon + `#6b645d` 11.5): "This device stays signed in for 30 days."

### Step B — authenticator code (revealed only if MFA on; a *continuation*, not an error)
- Back affordance top-left (chevron + "Back" → returns to Step A). A **52px accent tile** (radius
  15, bg `rgba(249,115,22,.12)`, border `rgba(249,115,22,.35)`) with a lock icon (`#f97316`).
- **Title** "Check your authenticator" (`700 / 26 / 1.15`). **Helper** (`#a8a29e` 13.5/1.6):
  "Enter the 6-digit code for Grotto from your authenticator app."
- **OTP field** — 6 cells, gap 9px, each **42×52**, radius 12. `inputmode="numeric"`,
  `autocomplete="one-time-code"`. States:
  - **filled:** `border #4a4038`, bg `rgba(16,14,12,.8)`, digit Mono `600/24` `#e7e5e4`.
  - **active:** `border 1.5px #f97316`, bg `rgba(249,115,22,.08)`, ring `0 0 0 3px
    rgba(249,115,22,.14)`, blinking caret (2×24 `#f97316`).
  - **empty:** `border #3b352f`, bg `rgba(16,14,12,.5)`.
- **Verify CTA** (accent fill + check icon) — **auto-submits on the 6th digit**. Foot helper
  (refresh icon, `#6b645d`): "Codes refresh every 30 seconds."

### Step B′ — error & throttle
- **Wrong / reused code:** cells clear with a brief danger flash + an inline `danger-soft` message
  (e.g. "Incorrect code — N attempts left").
- **Throttled:** 52px **danger tile** (bg `rgba(196,69,69,.12)`, border `rgba(196,69,69,.4)`, clock
  icon `#e08a8a`); title "Too many attempts" (`700/24`); helper "Codes are paused briefly to keep
  the cave safe. Try again shortly."; OTP cells dimmed (`opacity .4`, all empty); a `danger-soft`
  banner (bg `rgba(196,69,69,.1)`, border `rgba(196,69,69,.35)`, radius 14): clock + "Try again in
  **0:28**" (countdown in Mono `600`, text `#f0d0d0`); **Verify disabled** (bg `#292524`, text
  `#6b645d`).
- **State machine:** `token → (busy) → code → (busy) → success | error | throttle`. `error` returns
  to `code` (cleared); `throttle` locks `code` until the retry-after elapses.

**CONTRACT:** the master token (+ code) is exchanged for a **revocable 30-day device credential**;
only the credential persists (localStorage). No username / no signup. A **401 anywhere** in the app
drops back into this flow.

---

## Screen 2 — Settings: account & security  ·  `5b`  ·  DESIGN.md §3.2 (cards 3–4)

App-chrome surface (dark `#12100e`, not the login atmosphere). Top bar: back ‹ + "Settings"
(`600/16`), hairline `#3b352f`. Scrolling stack of cards (radius 14, bg `#1c1917`, border
`#3b352f`).

### Claude authentication card (collapsible — shown **expanded** in `5b`)
- **Header:** title "Claude authentication" (`600/14`); **status line** — `ok-check` (`#1f8a5b`)
  tick + one of: "Long-lived token stored · from setup-token" / "Token from environment" /
  "Interactive login (or none)" (Mono 11.5, `#a8a29e`); chevron (up when open).
- **Manage → Replace token** (divider `#241f1b`): eyebrow "REPLACE TOKEN" (`#6b645d`,
  `.12em`/upper); a **write-only** paste field (radius 11, border `#3b352f`, bg `#100e0c`, lock
  icon, placeholder "Paste `claude setup-token`…", Mono 13.5 `#6b645d`); buttons **"Save token"**
  (accent fill, `600/13`) + **"Remove"** (border `#7a2626`, `#ef4444`); note (`#6b645d` 11/1.5):
  "Stored write-only — Grotto shows that a token is present, never its value."
- **CONTRACT:** the field is **write-only** — never render the token value; status returns
  presence + source only.

### Security card (collapsible)
- **Collapsed:** title "Security" + status — hollow dot + "Two-factor off" **or** `ok-check` +
  "Authenticator MFA on"; "Manage" (`#f97316`) + chevron.
- **Manage → Enrol** (shown in `5b` phone 2): its own screen (top bar "Two-factor"). A **52px
  accent tile** with a shield-check (`#f97316`); title "Turn on two-factor" (`700/18`); a
  **consequence explainer** (plain prose, `#a8a29e` 13/1.6, max 270): "With two-factor on, the
  master token can't sign in on its own — every new device also needs a 6-digit code from your
  authenticator." Then:
  - **"Open in Authenticator"** — accent fill (`600/15`, external-link icon), an `otpauth://`
    deep-link; subcopy "Adds Grotto to your authenticator app." **No QR** — you can't scan the
    screen you're holding (CONTRACT).
  - Divider "or enter the key"; a **manual secret** in a **dashed** box (border `#4a4038`, bg
    `#100e0c`, Mono `600/15`, `letter-spacing .12em`, e.g. `K5RA WYLZ 7Q2M 4T6N`) + copy icon.
  - **Confirm:** eyebrow "ENTER THE CODE TO CONFIRM"; a 6-cell OTP field (same spec as login,
    active first cell); **"Turn on two-factor"** CTA — disabled (`#292524`/`#6b645d`) until 6
    digits.
  - **CONTRACT:** enabling MFA **stops the master token from authorizing on its own**.
- **Manage → Disable** (not mocked): destructive styling; **requires a current 6-digit code** to
  turn off.

### Appearance + Sign out
- **Appearance card:** 3-way segmented control **System · Light · Dark** (track bg `#100e0c`,
  border `#3b352f`; active = bg `rgba(249,115,22,.16)`, text `#f97316`). Drives the theme (default
  Dark; light mode = README §Light + dark-terminal rule).
- **Sign out:** row (border `#3b352f`, bg `#1c1917`, text `#ef4444`, log-out icon) + microcopy
  "Revokes this device's 30-day credential."

---

## Interactions & behaviour

- **Two-step reveal:** a successful token submit with MFA on **reveals** the code step in place
  (slide/fade, ~300ms `cubic-bezier(0.2,0.7,0.2,1)`) — framed as progress, not an error. With MFA
  **off**, token submit goes straight to the control room (no step 2).
- **OTP entry:** numeric keyboard, one digit per cell, auto-advance, paste fills all six,
  backspace steps back; **auto-submit on the 6th digit**. Same component reused for login and MFA
  confirm.
- **otpauth deep-link:** "Open in Authenticator" opens `otpauth://totp/Grotto:<label>?secret=…` so
  the authenticator app registers Grotto without a scan; the manual secret is the fallback.
- **Throttle:** on `429`, lock the OTP + Verify and **count down** the server's retry-after (`m:ss`,
  Mono); re-enable at zero.
- **Enable/disable MFA:** enable requires confirming a fresh code; disable requires a current code
  (destructive confirm). Claude-token Save/Remove are immediate with a status refresh.

## State management

- **Device credential** — replaces the raw token: `localStorage['grotto-cred']`; `Bearer` on every
  request + WS URL; **sign out revokes it server-side**; 401 → re-run login.
- **Login UI** — step machine (`token | code | error | throttle`), busy flags, throttle timer.
- **MFA** — `enabled` (from `/auth/status`); enrol transient state (`secret`, `otpauthUrl`, confirm
  code); disable (current code).
- **Claude auth** — `{present, source}` only (never the value); Save/Remove mutate + refetch status.
- **Theme** — `system | light | dark` (persisted), default dark.

## Server endpoints needed (NEW — Code's domain; confirm/define these)

The current server has only "one bearer token". The `5a`/`5b` UI is built to these **proposed**
shapes — align them with the real implementation:

| Endpoint | Purpose | Notable responses |
|---|---|---|
| `POST /api/auth/login` `{token, code?}` | exchange master token (+ code) for a device credential | `200 {mfaRequired:true}` (reveal code step) · `200 {credential, expiresAt}` · `401 {error, attemptsLeft?}` (bad code) · `429 {error, retryAfter}` (throttle → countdown) |
| `POST /api/auth/logout` | revoke this device credential | `200` |
| `GET /api/auth/status` | Settings state | `{mfaEnabled, claudeAuth:{present, source}}` |
| `POST /api/auth/mfa/enroll` | begin TOTP enrol | `{secret, otpauthUrl}` |
| `POST /api/auth/mfa/enroll/confirm` `{code}` | finish enrol (valid code required) | `200` / `401` |
| `POST /api/auth/mfa/disable` `{code}` | turn off (current code required) | `200` / `401` |
| `PUT /api/auth/claude-token` `{token}` | store `setup-token` (**write-only**) | `200` |
| `DELETE /api/auth/claude-token` | remove it | `200` |

All existing endpoints (`/api/sessions`, `/term`, files, git, …) accept the **device credential**
as `Bearer`. Throttling should return a machine-readable `retryAfter` (seconds) so the UI counts
down. Never return the Claude token value or the MFA secret after enrolment.

## Files

- **Design:** `grotto-designs.html` → options **`5a`** (login: token / code / throttle) and
  **`5b`** (settings: Claude auth expanded / MFA enrol). Source: `grotto-designs.dc.html`.
- **Repo (to build):** `apps/grotto/src/components/Login.tsx` (→ two-step MFA), a **new**
  `Settings` / `Security` screen (Claude-auth + MFA cards), `src/App.tsx` (routing: gate on device
  credential; gear → Settings), `src/api.ts` (add the auth endpoints above; store the credential
  instead of the raw token), `src/styles.css` (OTP cell, throttle `danger-soft`). Read
  `apps/grotto/DESIGN.md` §3.1–3.2 (revised) for the contracts.
```