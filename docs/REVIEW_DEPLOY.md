# Deploy Development Intelligence for a review

A focused, end-to-end guide to standing up the **turn-35 desktop UI** (this
branch) on Railway so someone can review it against the live control plane.
For the full canonical Railway reference — day-2 ops, rotation, the complete
troubleshooting matrix — see [`DEPLOY.md`](../DEPLOY.md); this guide is the
review quickstart and doesn't repeat all of it.

---

## TL;DR

- **One Railway service**, built from the repo-root `Dockerfile`. It serves the
  PWA, the API, the WebSocket chat, and the preview proxy — all same-origin.
- **Vercel is not used** (and can't host this). See [§6](#6--do-i-need-vercel).
- Deploy **from this feature branch**, attach a **`/data` volume**, set five
  env vars, **create one session out-of-band** (the new UI has no
  create-session button yet), then hand the reviewer the URL + token.
- **Review on a desktop browser** — the turn-35 shell is desktop-first; the
  phone-responsive shell is the next phase.

---

## 1 · Create the service (from this branch)

The new UI lives on `claude/migration-dev-intelligence-3ol1dc`, not `main`.
Deploy that branch directly for the review (merge to `main` later).

1. Railway → **New Project → Deploy from GitHub repo → `jwalker618/development-intelligence`**.
2. Service **Settings** before the first build finishes:
   - **Config file path** → `railway.json` (Dockerfile builder, `/api/health`
     healthcheck, restart-on-failure).
   - **Root Directory** → leave **empty** (the Dockerfile's build context is the
     repo root — it needs `pnpm-workspace.yaml`).
   - **Branch** → `claude/migration-dev-intelligence-3ol1dc`. Pushes to it
     auto-deploy.

## 2 · Attach the volume (required)

Service → **Attach Volume**, mount path **`/data`**. Everything durable lives
here — Claude credentials, caveman state, the session registry and workspaces,
MFA, device logins. Without it every redeploy is a factory reset.

## 3 · Variables

| Variable | Value | Why |
|---|---|---|
| `GROTTO_TOKEN` | a long secret (`openssl rand -base64 32`) | The master token the reviewer signs in with. Ephemeral FS ⇒ set it, or a new one is minted per deploy and everyone is signed out. |
| `GROTTO_GIT_TOKEN` | GitHub PAT (fine-grained, **Contents: Read/write** on the review repo) | Clone/push + the repo picker. |
| `GROTTO_REPOS` | e.g. `jwalker618/development-intelligence` | Repo list (comma-separated, no spaces). |
| `CLAUDE_CONFIG_DIR` | `/data/claude-config` | Claude Code state on the volume. |
| `GROTTO_HOME` | `/data/grotto` | Session workspaces + registry + auth state on the volume. |

Optional: `CAVEMAN_DEFAULT_MODE=ultra`; `ANTHROPIC_API_KEY` (only if you want
API billing instead of connecting a Claude subscription in step 5).
**Do not set `PORT`** — Railway injects it and the server binds to it
(`server/config.ts`).

## 4 · Networking

**Settings → Networking → Generate Domain.** You get HTTPS + WebSockets at the
edge, both of which the app requires (the bearer credential rides every request;
the chat is a WS). **Keep App Sleeping / Serverless OFF** — a sleeping container
kills live agent sessions. First build is ~5–10 min (apt, Claude Code + Gemini
CLI, caveman + RTK, pnpm, Vite). Healthcheck green ⇒ `https://<domain>/api/health`
returns `{"ok":true}`.

## 5 · Make it reviewable (the two steps the UI can't do yet)

The turn-35 UI is wired to the control plane, but two setup actions have no
button in it yet. Do them once, out-of-band.

### 5a · Create the first session  ⚠️ required

The new UI bootstraps onto the **first existing session**; with none, it shows a
"No active session" banner and the screens sit on sample data. Create one
(with MFA still off, the master token authorizes directly):

```bash
curl -X POST https://<domain>/api/sessions \
  -H "Authorization: Bearer $GROTTO_TOKEN" \
  -H "content-type: application/json" \
  -d '{"repo":"jwalker618/development-intelligence"}'
```

(Or use Railway → service → **Shell** and the same call against
`http://localhost:$PORT`.) This clones the repo into a workspace on the volume;
the next page load lands the reviewer on **Changes** with real git status.

### 5b · Connect Claude  (only if the review should exercise the agent chat)

Git status/diff, the caveman dial, the timeline, and the file tree are live
**without** Claude auth. The **Session chat** only responds once Claude is
connected. Either set `ANTHROPIC_API_KEY` (step 3), or connect a subscription:
the guided `claude setup-token` flow from `DEPLOY.md` §6 still works — run it and
the minted token is stored write-only on the volume and injected into every
session. Skip this if the reviewer is only looking at the review/diff loop.

## 6 · Give the reviewer access

The control plane is **single-user** — one master token, shared sessions. For a
review window the simplest path:

1. Send the reviewer the **domain URL** and the **`GROTTO_TOKEN`**.
2. They open the URL on a **desktop browser** → the DI **Login** screen → paste
   the token → **Sign in**. They get their own revocable 30-day device
   credential (the master token never persists in their browser).
3. Keep **MFA off** during the review (MFA would force a TOTP code only you
   have). Turn it on afterward (`DEPLOY.md` §7).
4. When the review is done, **rotate `GROTTO_TOKEN`** to cut off access (existing
   device credentials expire in 30 days; changing the token blocks new logins).

What the reviewer sees, live: **Changes** (git status → click a file → real
diff parsed into hunks → Commit & sync), **Session** (caveman verbosity dial
writing the real flag, timeline from git log, and — if Claude is connected —
the chat with the Allow/Always/Deny approval card), **Files** (the real tree).
**Preview**, **Tasks**, RTK %, pins, and the semantic span-diff are on sample
data and are labelled **`SAMPLE`** in the UI — that's intentional (those
backends aren't built yet; see the design handoff §9).

---

## 6 · Do I need Vercel?

**No — and it can't host this.** The control plane is a **stateful, long-lived
Node server**: it holds WebSocket chat connections, spawns PTY/agent
subprocesses, reads and writes a **persistent `/data` volume**, and runs a
same-origin **`/preview/*` proxy** into dev servers inside the container.
Vercel's serverless/static model provides none of those — no persistent
process, no attached volume, no long-lived WebSockets, no container to proxy
into.

Splitting the **static front-end** onto Vercel while Railway keeps the API
doesn't work either, and would actively break the app:

- the PWA calls **same-origin** `/api/*`, `ws(s)://…/api/sessions/:id/chat`, and
  `/preview/:id/:port/…`; a different Vercel origin means CORS + cross-origin WS
  problems;
- **auth** rides a bearer credential on every request and a same-origin cookie
  for the preview iframe — cross-origin, the cookie path breaks;
- the server already **serves the built PWA itself** (`serveStatic` with SPA
  fallback in `server/http.ts`), so there's nothing for Vercel to add.

So: **one Railway service, no Vercel.** (Vercel would only make sense for a
throwaway *static shell* of the UI with no backend — which shows the Login
screen and then can't do anything, so it's useless for a functional review.)

---

## Quick troubleshooting (review-specific)

| Symptom | Fix |
|---|---|
| Login screen accepts the token but every screen is empty, banner says "No active session" | You skipped **§5a** — create a session. |
| Session chat never replies (git/diff/caveman all fine) | Claude not connected — do **§5b** or set `ANTHROPIC_API_KEY`. |
| Reviewer gets "unauthorized" after a redeploy | `GROTTO_TOKEN` wasn't set as a variable, so it regenerated — set it, sign in again. |
| Build fails copying `pnpm-workspace.yaml` | Root Directory was set — clear it (build context must be the repo root). |
| Screens look cramped / rail overlaps | Reviewing on a phone — the turn-35 shell is desktop-first; use a desktop browser. |
| Preview tab blank | No dev server running on that port inside the session — expected until one is started. |

For anything else, **Settings → Diagnostics** in the app checks the whole
Claude/caveman/RTK chain, and `DEPLOY.md`'s troubleshooting matrix covers the
rest.
