# Task runner — design note

**For: the Claude Design session.** This specifies a **task runner** for the
Development Intelligence IDE and PWA: a terminal replacement optimised for
vibe-coding. Not a shell emulator — a surface where recurring runbooks become
first-class, parameterised, saved **tasks** with buttons, safe secret handling,
and confirmation gates.

Read alongside `DESIGN.md` (brand, ergonomics, contracts) and
`docs/ide-integration-constraints.md` (the IDE seams). The
`server/pty.ts` + streaming event model this reuses is described in
`ide/README.md`.

---

## 0 · The reframe — task-first, terminal-second

> Almost everything a user actually types into a terminal is a small set of
> recurring runbooks. Make **those** first-class. Keep a raw terminal only as
> the escape hatch for the genuinely ad-hoc.

This mirrors the product's agent-first/terminal-second posture. The **Term tab
stays** (unchanged, escape hatch); the **task runner is the primary surface**
for anything a user does more than once.

---

## 1 · The problem, from a real runbook

This is a real script a user pastes to seed their backend (secret redacted):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force   # OS ceremony
npm i -g @railway/cli                                                # setup, not task
$env:Path = ...refresh...                                           # OS ceremony
railway login                                                       # interactive auth
railway link                                                        # "pick your API service" — a raw prompt
railway ssh sh -c 'cd /app; export DATABASE_URL_SYNC="postgres://…SECRET…";
  export DSI_REBUILD_RESET=1 DSI_PER_CONFIG=25 DSI_CLIENTS_PER_TIER=300;
  python -m seed'                                                    # inline secret + params + DESTRUCTIVE
```

Every line is a requirement in disguise:

| In the script | The real need |
|---|---|
| ExecutionPolicy, PATH refresh | **OS ceremony** — vanishes; tasks run in the Linux session container |
| `npm i -g` | **Setup ≠ task** — provision once, cached; don't re-run per invocation |
| `railway login` / `link` | **Interactive auth** — handled out-of-band, never a raw prompt |
| inline `DATABASE_URL_SYNC=…` | **Secret** — a reference resolved server-side, never pasted or shown |
| `DSI_PER_CONFIG=25` etc. | **Params** — a typed form, not hand-edited inline |
| `DSI_REBUILD_RESET=1` | **Destructive** — a confirmation gate before it runs |
| the 🔴 "REPLACE ONLY THE URL" comment | the whole reason this feature exists — no fat-fingering a hand-edited command |

---

## 2 · The task manifest (what the UI renders)

A task is a declarative manifest. Design renders a UI **from these fields** —
the schema below is the contract for what controls must exist. The runbook
above becomes:

```yaml
name: Seed DSI backend
description: Reset and reseed the DSI Postgres with in-network synthetic data.
destructive: true
confirm: { challenge: "Type the service name to confirm", expect: dsi-api }
setup:                                   # idempotent, cached once per container
  - provision: railway-cli               # pre-baked like caveman/RTK
  - auth: railway                         # guided device-flow once, token on the volume
params:
  per_config:       { type: int,  default: 25 }
  clients_per_tier: { type: int,  default: 300 }
  reset:            { type: bool, default: true }
env:
  DATABASE_URL_SYNC: ${{ secrets.DSI_DATABASE_URL }}   # resolved server-side, redacted
run:
  - railway ssh sh -c 'cd /app &&
      export DATABASE_URL_SYNC="$DATABASE_URL_SYNC"
             DSI_REBUILD_RESET=${{ params.reset ? 1 : 0 }}
             DSI_PER_CONFIG=${{ params.per_config }}
             DSI_CLIENTS_PER_TIER=${{ params.clients_per_tier }} &&
      python -m seed'
```

**Param types → controls design must provide:**

| `type` | Control |
|---|---|
| `string` | text field |
| `int` / `number` | number field with validation |
| `bool` | toggle |
| `enum` | segmented control / select |
| `secret-ref` | **not an input** — a locked chip "🔒 from DI secrets", value never shown |

---

## 3 · Screens to design

1. **Task palette** (the home). Per-session list of tasks, grouped/searchable,
   each a Run affordance. Empty state that teaches "save a runbook as a task."
   One-thumb: Run reachable in the bottom half.
2. **Task detail → param form.** Typed controls (§2), defaults pre-filled,
   inline validation. Shows **setup status** inline — e.g. `railway ✓ authed`
   or `railway — connect needed` (links into the guided flow, §5). Primary
   action: **Run** (or **Review & run** for destructive, §4).
3. **Confirm gate** (destructive only). See §4 — this is a distinct, deliberate
   screen, not a small dialog.
4. **Run view.** Streaming output, status (running / failed / done), an
   **Interrupt** control, and it **survives a dropped socket** (reconnect into
   the running task). Secrets **redacted** in the stream. If a step prompts,
   render a **structured question card** (like the agent's Allow/Deny), never a
   raw TUI. Retain output after completion.
5. **Setup / guided auth.** Reuse the visual pattern of the existing guided
   Claude connect (device-code URL → complete in browser → "authed ✓"). Runs
   once; state persists on the volume.
6. **Save-as-task.** Turn a run (or an agent's proposed command) into a named,
   parameterised task — promote inline values to params, inline secrets to refs.

**States every surface must cover:** not-provisioned · ready · running ·
awaiting-input (structured prompt) · awaiting-confirm · succeeded · failed ·
disconnected/reconnecting.

---

## 4 · Destructive tasks — the confirm gate (brand rule applies)

`destructive: true` tasks (reset, wipe, deploy-to-prod, drop) get a real gate,
the command analogue of the review-queue's revert confirmation:

- A **typed challenge** (`confirm.expect`) — the user types the target name, or
  an explicit "I understand this resets ~10k rows." The runner **refuses to
  proceed** without a match. This is deliberately phone-safe: a fat-finger
  can't trigger a wipe.
- **Plain prose, never caveman voice.** Per the brand's auto-clarity rule
  (`DESIGN.md` §Brand), destructive confirmations and security copy are plain,
  clear prose. No "old rocks heavy" here — state exactly what will be destroyed.
- Show **what will run** (resolved command with secrets masked, params filled)
  before the gate — review-first applied to execution.

---

## 5 · The three hard parts (each has an existing DI pattern)

- **Interactive auth** → the **guided-connect pattern** already built for
  Claude. Run once server-side, capture the device-code URL, complete in a
  browser, persist the token on the volume. A mid-run prompt becomes a
  structured card, never a raw TUI.
- **Secrets** → a **reference** in the manifest, resolved server-side from the
  container env or a DI secret store, **redacted from streamed output and
  logs**. Design shows secrets only as locked chips — the value is never
  rendered, never copyable, never in a saved runbook.
- **Destructive** → §4.

---

## 6 · What design MAY and MAY NOT do

**MAY** — full creative control over the palette, param forms, run view,
confirm gate, setup flow, and all their states.

**MUST**
- Render destructive/security copy in **plain prose** (brand rule).
- Never display a resolved **secret value** — locked chips only; redact in output.
- Design for **one-thumb** (Run and confirm controls in the bottom half).
- Design the run view to be **interruptible and reconnect-safe** (a dropped
  socket must not lose a running task).

**MAY NOT**
- Make a raw always-on TUI the primary surface — the raw Term tab is a separate
  escape hatch, not this.
- Surface interactive auth or mid-run prompts as raw terminal text — structured
  cards only.

---

## 7 · Surface fit

- **PWA** — full DI UI: palette, forms, run view. Primary target; phone-first.
- **IDE** — a native **DI task tree view** (sibling of the Review queue),
  quick-pick or webview param form, running via the control plane. (VS Code's
  native `tasks.json` is **insufficient** — no typed params, no secret refs, no
  destructive gate, no reconnect-safe streaming — so DI builds its own and can
  export to `tasks.json` for compatibility, not depend on it.)
- **Agent** — tasks are exposed as an MCP tool (`run_task`), so the official
  Claude Code panel can invoke them: "seed the DSI backend with 10k in-network"
  → agent fills params → still stops at the confirm gate. Tasks are the
  **deterministic** counterpart to the agent: routine ops run without spending
  model tokens.

---

## 8 · Build order (so design knows MVP vs later)

1. **Saved scripts + Run button** — named files in a task palette, params via
   prompted env vars. Design the palette + run view first; this is the MVP.
2. **Typed manifests** — param forms, secret refs, confirm gates, setup/run
   split (§2–5). The core of the feature.
3. **Agent-authored / agent-invocable** — save-as-task and the `run_task` MCP
   tool (§7). Falls out cheaply once the runner exists.

Design 1–2 as one coherent system; 3 reuses the same screens.

---

## 9 · One-paragraph brief

> Design a **task runner** that replaces the terminal for anything done more
> than once: recurring runbooks become saved, named **tasks** rendered from a
> manifest — a **task palette**, a **typed param form** (secrets shown only as
> locked chips, never values), a **run view** that streams output, redacts
> secrets, survives a dropped socket, and shows structured cards instead of raw
> prompts, and — for destructive tasks — a **plain-prose confirm gate** with a
> typed challenge that can't be fat-fingered. Interactive auth reuses the
> guided Claude-connect pattern. It runs server-side in the session container;
> the raw Term tab stays only as an escape hatch. One-thumb, interruptible,
> phone-first. On the IDE it's a DI tree view beside the Review queue; the agent
> can invoke tasks as a tool.
