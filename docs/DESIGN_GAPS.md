# Screens & surfaces still to design

**For: the next Claude Design session.** The turn-35 pack delivered five
in-session screens — **35a Session · 35b Changes · 35c Files · 35d Preview ·
35e Tasks** — plus the rail/theme system. Everything a user needs *to get into*
a session, *authenticate*, *configure*, and every *non-happy-path state* was
never designed. This is that list.

Design all of it in the established DI language: `tokens.css`, the 340px theme
rail + main shell, coral nav/CTA constants, plain-prose auth/security copy,
Lucide icons. Where a reference exists it's noted.

Legend for **Backend**: ✅ endpoint exists (design for something real) · ⚙️
backend must be built too (design can run ahead) · n/a client-only.

---

## A · Session lifecycle — the missing navigation layer  ⚠️ biggest gap

The five screens are all *inside one session*, but **there is no designed way to
create, choose, or switch sessions.** The flush-nav button only swaps among the
five screens; its "repo count · 3" points at a multi-repo/session concept that
has no screen. This is a structural decision the design must make: **what wraps
the workbench?**

| Surface | What it is | States to draw | Backend |
|---|---|---|---|
| **Sessions home / picker** | The landing surface after login — list of active sessions (repo, branch, "needs you", last activity) | empty ("no sessions yet"), populated, one session `needsYou` | ✅ `GET /api/sessions` |
| **New session flow** | Pick a repo (searchable list + free-type `owner/repo`) → pick/enter a branch → create | repo search, branch entry, **cloning/provisioning** (progress), ready, error | ✅ `POST /api/sessions`, `GET /api/repos` |
| **Session switcher** | Move between sessions without losing place; how it relates to the flush-nav | collapsed affordance + expanded list | ✅ |
| **Close / delete session** | Remove a workspace | confirm (destructive, plain prose) | ✅ `DELETE /api/sessions/:id` |

Reference: old PWA `src/components/ControlRoom.tsx` (behaviour, not visuals).

---

## B · Onboarding & authentication

I improvised a `Login.tsx` to make the app boot; it is **not designed**. All of
this needs the DI treatment.

| Surface | What it is | States to draw | Backend |
|---|---|---|---|
| **Login** | Token → device credential | token entry, **MFA code step**, error + throttle ("N attempts left / wait 15 min"), the **401 re-auth** re-entry | ✅ `POST /api/login` |
| **Connect Claude (guided)** ⚠️ | 3-step: open claude.ai → paste the code → connected. Without it, chat is dead | idle, starting, **awaiting-code** (the URL + paste field), verifying, connected, error/"start over" | ✅ `/api/claude-auth/{start,code,cancel}` |
| **Manual Claude token** | Paste a token you minted elsewhere | entry + stored/cleared | ✅ `PUT/DELETE /api/claude-token` |

References: `docs/design-history/AUTH_MFA.md` (old-product MFA spec — re-skin to
DI), old `ClaudeConnect.tsx` / `Otp.tsx` (behaviour).

---

## C · Settings / Account / Diagnostics — no entry point exists

There is **no gear, no account surface** anywhere in the shell. Design the entry
(where it lives relative to the nav) and the surface itself.

| Card / screen | What it is | Backend |
|---|---|---|
| **Claude authentication** | Connection status, reconnect, manual token, disconnect | ✅ |
| **Security** | MFA enrol (TOTP/otpauth), disable, device-credential info, **sign out** | ✅ `/api/mfa/*`, `DELETE /api/login` |
| **Diagnostics / Repair** | The caveman + RTK health chain (CLI, RTK, hooks, statusline, provisioning marker) with a Repair action + output — operationally important on a fresh deploy | ✅ `/api/doctor`, `/api/doctor/repair` |
| **Appearance** | The five rail themes (today buried in the nav menu) — decide its home | n/a |

Reference: old `SettingsScreen.tsx`.

---

## D · Non-happy-path states for the five existing screens

The pack drew each screen **full of data**. These states were never drawn and
are what a real (and freshly-deployed) app shows most of the time:

- **No session yet** — what the whole workbench shows before section A exists (today: a one-line banner I improvised).
- **Connecting / loading** — first control-plane fetch.
- **Offline / reconnecting** — "session still alive" per the design invariant (WS drop).
- **Per-screen empties**: Changes with no changes · Changes with no diff selected · Session chat with no messages · Session **before Claude is connected** (prompt to connect) · Files empty/loading tree · a binary/too-large file.

Each deserves a designed empty/loading/error treatment, not a fallback.

---

## E · Flows & modals inside the five screens (specified or implied, never drawn)

| Surface | Screen | Note | Backend |
|---|---|---|---|
| **Model picker** | Session | The model pill should open a switcher; today it's static text | ✅ `POST …/chat/model` |
| **File viewer → editor** | Files | 35c drew a read-only view; the **Edit** mode, save, and dirty state are undrawn | ✅ `PUT …/file` |
| **New file / New folder / Upload** | Files | The buttons exist; the **naming dialogs / upload picker** flows aren't drawn | ✅ `…/file`, `…/mkdir`, `…/upload` |
| **Task run view** | Tasks | `TASK_RUNNER.md` specifies it (streaming output, interrupt, reconnect, structured prompt cards) — **only the param form (35e) was drawn** | ⚙️ |
| **Task guided auth** | Tasks | Setup/device-flow screen — specified, not drawn | ⚙️ |
| **Save-as-task** | Tasks | Promote a run/command into a task — specified, not drawn | ⚙️ |

The three Task sub-screens have a written contract in `TASK_RUNNER.md` §Screens
— they just lack pixels.

---

## F · Preview, for real (design can run ahead of the backend)

35d drew a **mock device frame**. The real Preview needs states the mock skips:

- **Which dev server** — port discovery / picker (a session can run several).
- **No dev server running** — the most common state; an inviting empty state, not a blank iframe.
- **Connecting / crashed / rebuilding**.
- **Runtime error → agent** — the "Send to agent" flow that turns a captured console/network error into an agent task (today cosmetic).

Backend: the preview proxy exists ✅; the **runtime-capture bridge is ⚙️** (build-ahead).

---

## Priority for design (matches the make-it-live order)

1. **A · Session lifecycle** and **B · Connect Claude + Login** — nothing else is
   reachable or usable without these; they're what turn a deploy from empty into
   demo-able.
2. **D · the empty/loading/offline states** — because they're what's actually on
   screen most of the time.
3. **C · Settings/Diagnostics**, then **E · the in-screen flows**.
4. **F · Preview-real** and the **Task sub-screens** — can be designed ahead of
   their backends (§ Phase 3 in `WIRING_STATUS.md`).

Nothing here changes the five delivered screens; it's the surrounding surfaces
and states they assume but never showed.
