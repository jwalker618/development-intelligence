# Deploying Development Intelligence to Railway

The complete, current guide — it supersedes anything older. Development Intelligence deploys as
**one Railway service** built from the repo-root `Dockerfile`: the container is
both the web app and the vibe-coding environment (git, Claude Code, Gemini
CLI, caveman + RTK baked in). Sessions are workspaces inside it; your phone is
a viewport.

## What you need before starting

| Secret | How to get it |
|---|---|
| `GROTTO_TOKEN` | Invent it: `openssl rand -base64 32`. This is the **master token** — the thing you type at "Enter the cave". Keep it long; with MFA on it becomes only the first factor. |
| `GROTTO_GIT_TOKEN` | GitHub → Settings → Developer settings → **Fine-grained token**, scoped to the repos you'll code on, permission **Contents: Read and write**. (Classic PAT with `repo` scope also works.) This token also powers the New-session repo **search** (lists whatever it can read) and in-flow repo **creation** — creation needs classic `repo` scope or fine-grained **Administration: write**; without it, search still works and creation shows a clear error. |
| Claude auth | Nothing up front — you'll mint a subscription token from inside the app after first boot (step 6). |

## 1 · Create the service

1. Railway → **New Project → Deploy from GitHub repo → `jwalker618/development-intelligence`**
   (or add a service to an existing project from the same repo).
2. Before the first build finishes, open the service **Settings**:
   - **Config file path** → `railway.json` (applies the Dockerfile
     builder, `/api/health` healthcheck, restart-on-failure).
   - **Root Directory** → leave **empty**. The Dockerfile needs the monorepo
     root as build context (`pnpm-workspace.yaml`, `packages/config`).
   - **Branch** → whichever branch you deploy from; pushes to it auto-deploy.

## 2 · Attach the volume (required for a seamless setup)

Service → **Attach Volume**, mount path **`/data`**.

Everything durable lives here: Claude credentials, caveman state and lifetime
savings, the session registry and workspaces, MFA state, device logins, your
stored setup-token. Without it, every deploy is a factory reset.

## 3 · Variables

| Variable | Value | Why |
|---|---|---|
| `GROTTO_TOKEN` | your secret | Ephemeral filesystem — without it a new token is minted per deploy and your phone is signed out |
| `GROTTO_GIT_TOKEN` | the GitHub PAT | Clone/push. Supplied to git via an askpass helper — never written into `.git/config` |
| `GROTTO_REPOS` | `jwalker618/generate-web,jwalker618/caveman,jwalker618/development-intelligence` | The repo picker (comma-separated, no spaces; free-typing `owner/repo` also works in the UI) |
| `CLAUDE_CONFIG_DIR` | `/data/claude-config` | Claude Code state on the volume — subscription login/token survives deploys |
| `GROTTO_HOME` | `/data/grotto` | Session workspaces + registry + auth state on the volume |

Optional: `GROTTO_SESSION_SETUP` (shell command run in each fresh workspace
after clone), `CAVEMAN_DEFAULT_MODE=ultra`, `ANTHROPIC_API_KEY` (only if you
prefer API billing over your subscription). Do **not** set `PORT` — Railway
injects it and the server binds to it.

## 4 · Networking & sleep

- **Settings → Networking → Generate Domain.** Enter any port when asked —
  the app reads Railway's injected `PORT`. You get HTTPS + WebSockets at the
  edge, which the app requires (the bearer credential rides every request).
- **Keep App Sleeping / Serverless OFF** (it's off by default). A sleeping
  container kills live agent PTYs.

## 5 · First deploy

The first build takes ~5–10 min (apt, Claude Code + Gemini CLI, the caveman
`--with-rtk` install, pnpm, Vite). Watch for:

- **Build log:** the caveman/RTK install step. It's best-effort — a warning
  doesn't fail the build; you can rerun it later from a session terminal
  (`node /opt/caveman/bin/install.js --with-rtk`).
- **Deploy log, first boot on the new volume:**
  `[grotto] first boot on this volume — provisioning caveman + RTK into /data/claude-config`
- Healthcheck goes green → `https://<domain>/api/health` returns `{"ok":true}`.

## 6 · First login & Claude auth (phone, ~3 minutes, once)

1. Open the domain → **Enter the cave** with `GROTTO_TOKEN`. You receive a
   revocable 30-day device credential; the master token itself never persists
   on the phone. **Add to Home Screen** for the standalone PWA.
2. **New session** (FAB) → pick a repo → the Agent tab opens.
3. Tap the **Connect Claude** chip (it leads the chips strip until a token is
   stored — also under Settings → Claude authentication → **Connect Claude
   (guided)**). A three-step modal walks the whole thing:
   1. **Open claude.ai** → sign in with your subscription account → Authorize.
   2. Copy the code claude.ai shows you → back in the app, **paste it into the
      code field** → Connect. (A normal form field — no terminal involved.)
   3. **Connected.** The app ran `claude setup-token` in a hidden server-side
      PTY, captured the minted token, and stored it write-only on the volume.
4. That token is injected as `CLAUDE_CODE_OAUTH_TOKEN` into every session
   shell — no per-container login, survives every redeploy, ~yearly renewal by
   re-running the same 60-second modal. (Manual paste of a token you minted
   elsewhere still works in the same Settings card.)
5. Sanity check — all in the **Agent (chat) tab**, no terminal needed: type a
   message, watch the reply stream in, approve the first tool call with the
   **Allow / Always / Deny** buttons, and see the model pill fill in the top
   bar (tap it to switch models). The agent runs Claude Code headlessly on
   the server — there is no login screen, trust dialog, or TUI to fight on
   the phone, and caveman + RTK apply to every reply. The **Term** tab still
   gives you a real shell in the same workspace when you want one.

## 7 · Turn on MFA (recommended)

Settings → **Security → Turn on two-factor** → **Open in Authenticator**
(adds Development Intelligence via `otpauth://` — no QR needed on the device you're holding) →
confirm with the 6-digit code.

From then on: login = master token **+** code; the master token alone stops
authorizing anything; codes are single-use; failed attempts throttle (8 per
15 min, with an in-app countdown). Sign out revokes that device's credential.

**Lost authenticator:** Railway → service → **Shell** →
`rm /data/grotto/mfa.json` → login reverts to token-only; re-enrol.

## Day-2 operations

- **Redeploys** (any push to the tracked branch): the session list, checkouts,
  branches, uncommitted files, Claude auth, MFA, and device logins all
  survive on the volume. Live terminals and scrollback don't — the shell
  respawns in place on your next connect. Habit: **⚡ Sync** anything you care
  about before pushing something that triggers a deploy.
- **Rotation:** master token → change `GROTTO_TOKEN` (existing device logins
  keep working until they expire; sign out to revoke). GitHub PAT → update
  `GROTTO_GIT_TOKEN` (applies on restart). Claude token → paste a new one in
  Settings (applies to new shells).
- **Sizing:** dev servers + agent runs are memory-hungry; if builds inside
  sessions OOM, bump the service's memory limit before anything else.

## Troubleshooting

**Start with Settings → Diagnostics.** It checks the whole chain (Claude CLI,
RTK, settings.json, hooks, statusline, provisioning marker, activation flag)
and its **Repair** button re-runs provisioning with the output shown. Most
rows below are visible there directly.

| Symptom | Likely cause / fix |
|---|---|
| Build fails copying `pnpm-workspace.yaml` | Root Directory was set — clear it (build context must be repo root) |
| Healthcheck never green | Deploy log: missing volume vars are fine, but a bad `railway.json` path or crash on boot shows here |
| "unauthorized" on the phone after a deploy | `GROTTO_TOKEN` unset (token regenerated) — set the variable, sign in once more |
| Agent says it's not authenticated | setup-token expired (~yearly) — rerun the guided connect (step 6.3) |
| `git push` fails inside sessions | PAT lacks **Contents: Read and write** on that repo, or expired |
| Preview tab blank/502 | No dev server on that port inside the session — start one in the Agent tab; the proxy reaches only `127.0.0.1` in the container |
| MFA throttle at login | Wait out the countdown (max 15 min) — or the lost-authenticator recovery above |
| Caveman pill says "caveman off" | Two normal causes. (1) The pill only lights after your **first `claude` session starts** — the SessionStart hook writes the flag. (2) Provisioning failed on an earlier boot: it retries on every boot until it succeeds (success marker: `$CLAUDE_CONFIG_DIR/.grotto-provisioned`), or run `node /opt/caveman/bin/install.js --with-hooks --with-rtk` in any session terminal |
| RTK install fails with a GitHub 403 | Unauthenticated GitHub **API** rate limit on datacenter IPs. The image pins `RTK_VERSION` so the installer skips the API; if a future version bump is needed, update the `ENV RTK_VERSION` in the Dockerfile (find tags with `git ls-remote --tags https://github.com/rtk-ai/rtk`) |
