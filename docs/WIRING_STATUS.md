# Wiring status — exactly what is live, cosmetic, or missing

Ground-truth audit of the turn-35 PWA (`src/di/`) against the control plane
(`server/`). Written to answer: *why does the deploy look like placeholders, and
what has to be turned on to make it live?*

## Why the deploy looks empty

The bootstrap (`useControl.ts`) attaches to **`sessions[0]`**. The new shell has
**no UI to create a session** and **no UI to connect Claude**. So on a fresh
deploy: Login → no session → `conn: "nosession"` → screens render empty states,
and the `SAMPLE`-flagged mock slices (RTK, pins, tasks, preview) are all that's
visible. The read-wiring works, but nothing produces real data to read.

**Two absent controls gate everything:** create-a-session and connect-Claude.
Both have working server endpoints and working UI in the *old* PWA
(`src/components/ControlRoom.tsx`, `ClaudeConnect.tsx`) — they were never ported
into the turn-35 shell.

---

## Legend
- 🟢 **LIVE** — wired to the control plane, works when a session exists (+ Claude connected for chat).
- 🟡 **COSMETIC** — the control renders but does nothing real (no-op or local-only state).
- 🔴 **NO UX** — no way to trigger it from the new UI at all (backend may exist).
- ⚫ **NO BACKEND** — the server endpoint doesn't exist; needs building, not just wiring.

---

## A · Onboarding & session lifecycle (the reason it looks dead)

Every item here has a **working server endpoint**; none is surfaced in the new shell.

| Capability | Status | Server seam (exists) | Old-UI reference |
|---|---|---|---|
| Create a session (clone a repo → workspace) | 🔴 NO UX | `POST /api/sessions` | `ControlRoom.tsx` |
| List / switch between sessions | 🔴 NO UX (only ever uses `sessions[0]`) | `GET /api/sessions` | `ControlRoom.tsx` |
| Connect Claude (guided `setup-token`) | 🔴 NO UX | `/api/claude-auth/{start,code,cancel}` | `ClaudeConnect.tsx` |
| Paste a Claude token manually | 🔴 NO UX | `PUT /api/claude-token` | `SettingsScreen.tsx` |
| Switch model | 🔴 NO UX (model is read-only text) | `POST /api/sessions/:id/chat/model` | — |
| Turn MFA on/off | 🔴 NO UX | `/api/mfa/{setup,enable,disable}` | `SettingsScreen.tsx`, `Otp.tsx` |
| Diagnostics / Repair (caveman+RTK health) | 🔴 NO UX | `/api/doctor`, `/api/doctor/repair` | `SettingsScreen.tsx` |
| Sign out / revoke device credential | 🔴 NO UX | `DELETE /api/login` | `SettingsScreen.tsx` |

**Login** itself is 🟢 LIVE (`Login.tsx` → `POST /api/login`, incl. MFA code).

---

## B · Per-screen control audit

### Session (35a)
| Control | Status | Note |
|---|---|---|
| Caveman verbosity dial | 🟢 LIVE | writes `POST /api/caveman` |
| Chat stream (user/agent/tool/approval) | 🟢 LIVE | folded from the chat WS — **needs Claude connected** |
| Allow / Always / Deny approval card | 🟢 LIVE | `POST …/chat/approval` |
| Composer send | 🟢 LIVE | `POST …/chat/message` |
| Interrupt (working·stop) | 🟢 LIVE | `POST …/chat/interrupt` |
| Timeline (git log) | 🟢 LIVE | ticks render… |
| Timeline ticks — click to jump/checkout | 🟡 COSMETIC | not clickable to any action |
| Model pill | 🟡 COSMETIC | displays only; no switch (see §A) |
| "Search this session" (⌘K) | 🟢 LIVE | `GET …/transcript/search?q=` over the chat log (`server/search.ts`) |
| Caveman KPI "% context saved" | ⚫ NO BACKEND | server gives a lifetime savings *string*, not a % |
| RTK "+% tokens returned" | ⚫ NO BACKEND | no RTK endpoint — `SAMPLE` |
| Pins (add/remove) | 🟢 LIVE | per-session pin store (`server/pins.ts`), `GET/POST/DELETE …/pins` |

### Changes (35b) — the review hero
| Control | Status | Note |
|---|---|---|
| Change list | 🟢 LIVE | `GET …/git/status` |
| Pending-approval "Needs you" row | 🟢 LIVE | from `session.approval` |
| Select change → diff | 🟢 LIVE | live **semantic span-diff** (`GET …/git/diff/semantic`), plain `git/diff` fallback |
| Commit & sync | 🟢 LIVE | `POST …/git {op:"sync"}` |
| Per-hunk **Keep** | 🟡 COSMETIC | local toggle; no persisted "reviewed" store |
| Per-hunk **Revert** | 🟡 COSMETIC | **does nothing** — no per-file/hunk git-discard op exists (⚫; only whole-tree `reset` is exposed) |
| Per-hunk **Tighten** | 🟡 COSMETIC | **does nothing** — should send a "tighten this file" prompt to chat (backend exists, unwired) |
| Mark-reviewed (✓) | 🟡 COSMETIC | local `Set` only, not persisted |
| Semantic diff (replace spans, LCS moves) | 🟢 LIVE | `server/spandiff.ts` — token-level inline ops + first-class Moved blocks; labelled "span diff · token-level" |

### Files (35c)
| Control | Status | Note |
|---|---|---|
| File tree | 🟢 LIVE | `GET …/tree` |
| Open a file → view contents | 🔴 NO UX | `onOpen` is a no-op; body is a placeholder. `GET …/file` exists |
| New file / New folder / Upload | 🟡 COSMETIC | buttons inert; `PUT …/file`, `…/mkdir`, `…/upload` exist |
| Edit | 🟡 COSMETIC | inert; `PUT …/file` exists |
| Pin-to-context toggle | 🟡 COSMETIC | local-only; no pin store |

### Preview (35d)
| Control | Status | Note |
|---|---|---|
| Running-app view | 🟡 COSMETIC | **hardcoded mock device frame**, not a real iframe. `previewUrl()` + `/preview` proxy exist but aren't used |
| Viewport switch (Phone/Tablet/Desktop) | 🟡 COSMETIC | resizes the mock frame only |
| Routes list | 🟡 COSMETIC | hardcoded |
| Runtime errors card | ⚫ NO BACKEND | no runtime capture bridge |
| Send to agent | 🟡 COSMETIC | just switches view; doesn't create a task from the error |

### Tasks (35e)
| Control | Status | Note |
|---|---|---|
| Palette, param form, secret chip, resolved command | 🟡 COSMETIC | all from seed data |
| Run / destructive confirm gate | 🟡 COSMETIC | typed-challenge UI works but leads nowhere |
| Everything | ⚫ NO BACKEND | no task-runner server at all — whole screen is `SAMPLE` |

### Shell
| Control | Status |
|---|---|
| View switcher (5 screens) | 🟢 LIVE |
| Theme picker (5 rails) | 🟢 LIVE |
| Repo count / nav | 🟢 LIVE (from session) |

---

## C · The turn-on plan (ordered by leverage)

### Phase 1 — surface the existing backends (makes the deploy demo-able)
*All endpoints already exist; this is porting old-PWA logic into the turn-35 shell.*
1. **Session picker + create** (`ControlRoom.tsx` logic) — without this the app is empty. **#1 priority.**
2. **Connect Claude** guided flow (`ClaudeConnect.tsx` logic) — without this chat never replies.
3. **File view** — wire `onOpen` → `GET …/file` → render in the Files main pane.
4. **Model switch** on the pill → `POST …/chat/model`.
5. **Settings surface**: MFA on/off, Diagnostics/Repair, manual Claude token, sign-out.

### Phase 2 — wire the cosmetic actions to existing backends
6. **Tighten** → send a scoped prompt to chat (`POST …/chat/message`).
7. **Revert** → needs a new small server op (`git checkout -- <path>` / per-hunk apply-reverse); today only whole-tree `reset` exists.
8. **Mark-reviewed persistence** → small server store (or keep local and label it honestly).
9. **Preview** → replace the mock frame with a real iframe to `previewUrl(id, port)`; needs dev-server port discovery.
10. **File create/folder/upload/edit** → wire to the existing endpoints.

### Phase 3 — build the missing backends (real engineering, not wiring)
11. **Task runner** server (provisioning cache, guided auth, secret store + redaction, reconnect-safe streaming, `run_task` MCP) — then wire screen 35e. *(still open)*
12. ✅ **Semantic span-diff** engine — **built** as `server/spandiff.ts` (self-contained line+token LCS with move detection; the `document-intelligence` repo is the DSI product, not a diff engine, so this is in-repo). Wired into Changes.
13. **RTK savings** + per-session **caveman %** endpoints → replace the two sample KPIs. *(no honest data source yet — caveman exposes a lifetime savings string, RTK has no stats endpoint; left as `SAMPLE` rather than fabricated.)*
14. **Preview runtime bridge** (capture console/network errors → agent task). *(still open)*
15. ✅ **Pins store** (`server/pins.ts`) + **transcript search** (`server/search.ts`) — **built** and wired into Session (rail pins + ⌘K).

---

## Honest one-liner
The review *read* loop (status → diff → commit; caveman dial; chat) is wired and
works — but only after a session exists and Claude is connected, and **neither is
reachable from the UI yet**. Phase 1 is what turns the deploy from "looks like
placeholders" into "demo-able." Phases 2–3 remove the remaining 🟡/⚫ items.
