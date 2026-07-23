# Handoff — Development Intelligence (review-first agentic IDE)

## 0 · What this is
**Development Intelligence (DI)** is an IDE for a new paradigm: you don't trade on how fast
you *type*, you trade on how fast you **review, validate and steer agent-written code**. The
heroes are **chat → review → merge**, not editing + terminal. DI is a dark-first member of the
**Generate** platform family (sibling to DSI).

Three surfaces, one server-side control plane (clients are viewports):
- **Phone PWA** — React 19 + Vite. Triage, review, git, preview, tasks on the go.
- **VS Code / web IDE** — the **official Claude Code panel** carries the agent conversation;
  DI adds the paradigm layer (Changes/Review queue, Session view, caveman + RTK economy, Tasks).
- **Control plane** — sessions, headless Claude Code (Agent SDK), token economy, auth/MFA.

> This package is the **design source of truth** for the UX. `Development Intelligence.dc.html`
> is the hi-fi reference (a canvas of screens grouped by "turn"). Recreate it in each target
> using that env's patterns — it is not production code to copy. Token *values* in `tokens.css`
> and `THEMES.md` are canonical, not the delivery mechanism.

---

## 1 · Canonical screens
Build from **turn 35** — the themed, shipping set:

| id | Screen | One line |
|----|--------|----------|
| 35a | **Session** | the agent conversation (official Claude Code panel) + DI Session rail |
| 35b | **Changes** | merged **diff + git** — the review hero |
| 35c | **Files** | tree + metadata + edit/add/upload |
| 35d | **Preview** | the running app in any viewport + runtime→agent |
| 35e | **Tasks** | the task runner (terminal replacement) |

**Rationale trail (history, do not build):** turn 33 = top-bar rework (per-hunk verdicts win);
turn 34 = the five rail-colour options; turns ≤32 and the coin studies (28/29) are superseded
chrome explorations. Search an id in the `.dc.html` to see its pixels.

---

## 2 · The shell (navigation model) — build this exactly
One consistent frame across all five views. **No top title bar and no separate side action
bar** — the earlier two-bar / two-"coin" chrome was dropped.

- **Flush nav button** — top-left corner, pinned to (0,0), hairline-nested into the card
  corner. Coral fill (`--di-spot`), glyph `square-arrow-out-down-right`, a divider, then the
  **repo count** (`folder-git-2` + N). It opens the **view switcher** (Session · Changes ·
  Files · Preview · Tasks). It is *only* navigation — it carries no screen state.
- **Theme rail** — a fixed **340px** left compartment. Coloured gradient fill + a **3px top
  accent bar**. Every rail leads with its **title eyebrow** at a shared **top:52px** indent
  (Session / Changes / Files / Preview / Tasks), then screen-specific controls, and — where the
  main area has a bottom input — a **bottom dock** aligned to it.
- **Main working area** — everything right of 340px; the screen's primary surface, full height,
  no wasted top band.
- **Rail colour is a user theme** (§4). **Constant across every theme:** the coral nav button,
  the coral primary CTA (Commit & sync / Review & run / Send to agent), and semantic
  **green = keep/add**, **red = revert/delete**.

---

## 3 · Screen specs

### 35a · Session — the agent conversation
- **Rail:** title "Session"; two **savings KPI tiles** — *Caveman* (`% context saved`, info-teal)
  + *RTK* (`+% tokens returned`, pos-green); a compact **Caveman verbosity** control rendered as
  an **interactive 4-bar column graph** (off · lite · full · ultra ascending; ultra lit coral;
  click a bar to set); a **timeline** (clickable ticks: now / ★ pinned / approved / merged); a
  **Pinned** list (removable chips); and a **search field docked at the rail bottom**, aligned
  with the composer.
- **Main:** the **official Claude Code panel** (header "Claude Code · Anthropic · Sonnet 4.5",
  working chip; user/agent turns, edit cards `Edit · file +/−`, approval cards; composer
  "Message Claude Code…" + @-mention + send). **DI never restyles the Claude Code interior** (§5).

### 35b · Changes — diff + git in one screen (the review hero)
- **Rail:** title "Changes"; a fixed **branch header** (`feat/… ↑2` + history + sync icon
  buttons); the **change list** grouped **Needs you** (coral spot bar) / **Awaiting** (theme-hue
  spot bar on the active row) with M/A/D chips, paths, +/− and a `⇄` move badge; a **commit
  dock** at the bottom ("Commit · N staged" + coral **Commit & sync**).
- **Main:** the **semantic diff**, full height — **no top action band**. Verdicts live **on the
  hunk**: a "this hunk — **Keep** (green) / **Revert** (red) / **Tighten** (theme-hue)" row. A
  small summary pill floats top-right (`+48 −12 · 1 move`).
- **Semantic diff** (model on the `document-intelligence` span engine, not line diff): ops
  `equal · insert · delete · replace · move`. **replace** = old tokens struck (neg) + new
  tokens highlighted (pos) *inline in the line*. **move** is first-class amber — one "N lines
  moved → file:line" block, collapsed (LCS-detected), never +N/−N noise. add = pos-soft bg + left
  pos border; del = neg-soft; hunk header = info on sunken. Mono 12.5 desktop / 11.5 phone.

### 35c · Files
- **Rail:** title "Files" + inline actions **New file / New folder / Upload**; the tree (dirs
  first; **pin toggle** — lit = in agent context; per-file size).
- **Main:** a **metadata bar** (`N rows · size · type · edited …`) + **Edit** action, then the
  file contents. Filename is shown in the tree/selection, not repeated in the body.

### 35d · Preview — the running app, any viewport
- **Rail:** title "Preview"; URL + current route; a **viewport switcher** (Phone / Tablet /
  Desktop; **Phone default** — DI is phone-first); a **Routes** list (`/ · /review · /sessions ·
  /login`); a **Runtime** card (`N errors · N warnings` + a top error line + **Send to agent**,
  which turns a runtime failure into an agent task — review-first); a hot-reload + build-time dock.
- **Main:** the running app inside a **device frame** (iPhone by default) on a soft radial
  backdrop, with a URL chip and a `device · WxH` label. Frame swaps with the viewport switch.

### 35e · Tasks — the task runner (terminal replacement)
Primary surface for anything done more than once; the raw terminal is an escape hatch only.
Full contract in **`TASK_RUNNER.md`** (source: `uploads/taskrunnerdesign.md`).
- **Rail:** title "Tasks"; search; a **task palette** grouped (Backend / Tests), each row
  icon + name + sub + **Run**, **destructive tasks dot-flagged** (neg); "Save a runbook as a
  task"; a **Raw terminal** escape-hatch dock at the bottom.
- **Main:** **task detail → param form** ("Seed DSI backend"): a **Destructive** chip + a
  **plain-prose** description; **setup status** inline (`railway authed · container ready`);
  typed **param controls** (int steppers, bool toggle, per §TASK_RUNNER); a **locked secret
  chip** (`🔒 DSI_DATABASE_URL — from DI secrets · value hidden`, never rendered); a **resolved
  command** preview with the secret **masked** and params filled; and a plain-prose **destructive
  footer + Review & run** that leads to the typed-challenge confirm gate.

---

## 4 · Theming — five rail identities (see `THEMES.md`)
The rail colour is a **per-user theme**. Ship all five (turn 34): **Indigo · Teal · Ember ·
Plum · Graphite**. A theme sets the rail gradient, top-accent, title eyebrow, branch/row/dock
tints and the "Tighten"/awaiting-active hue. It **must not** touch: the coral nav + coral CTA,
semantic green/red verdicts, or the deep-ocean main canvas. Implement as a
`[data-di-theme]` attribute driving the `--di-rail-*` tokens in `tokens.css`.

---

## 5 · Architecture invariants (do not violate)
- **Two diff moments, never merged:** (1) **Claude Code's own approvals** — inline, as the agent
  works, inside the Claude Code panel (**Anthropic's UX; DI does not build or restyle it**); (2)
  **DI Changes/Review** — review-what-landed (HEAD↔working) → keep / revert / tighten /
  mark-reviewed → commit. This is DI's product.
- **Claude Code panel interior is out of scope** — DI docks it and designs around/over it only.
- **Token economy** (caveman dial + RTK) is surfaced with pride (Session KPI tiles + graph),
  never debug noise. The dial writes the flag caveman's hooks read; DI mirrors the flag (~15s
  poll), never invents state.
- **Copy:** light caveman voice only in celebratory/empty moments; **plain prose** for errors,
  security, destructive confirmations, MFA/auth (brand auto-clarity rule).
- **Ergonomics:** one-thumb for frequent phone actions; 44px+ targets; `100dvh` + safe-area
  insets; horizontal overflow only inside designated scrollers.
- **Reconnect-safe:** phones lock and sockets drop; every surface reads as "session still alive"
  on reconnect; a 401 anywhere → one consistent "re-enter token" recovery.

## 6 · Identity & tokens
Warm cream ink on deep-ocean navy; **IBM Plex Sans** (UI) + **IBM Plex Mono** (code/tabular/
badges). Tone vocabulary maps onto review semantics — build against the meanings:

| Tone | Hex | Meaning in DI |
|------|-----|----------------|
| pos green | `#6eee7a` | keep · additions · reviewed |
| neg red | `#ff8585` | revert · deletions · destructive |
| warn amber | `#f8bd5e` | needs-you · conflict · **moved code** |
| info teal | `#39d3ba` | agent-produced facts · **caveman savings** |
| spot coral | `#f0926e` | your action · primary CTA · nav |
| aux indigo | `#9ab1f2` | external / secondary |

Eyebrow 10.5px/600/uppercase/+0.12em/ink-mute. Tabular numerals; hero figures tighten tracking.
Radii: card 14 · button 10 · tile 12 · chip 999. Elevation quiet — hairlines over shadow; real
shadow only for floating things. Motion 160ms fades, overlays 300ms `cubic-bezier(.2,.7,.2,1)`,
no bounce/gradient-noise/glassmorphism. Icons **Lucide** (names used verbatim). No emoji except
the caveman **⛏** feature glyph. Full values in `tokens.css`.

## 7 · State (per session)
`changes[]` (path, status M/A/D, hunks, ops incl. moves, reviewed, needsYou, +/−) · `pending`
approvals · `reviewed` set · `pins[]` · `timeline[]` · `caveman{mode,savedPct}` ·
`rtk{gainPct}` · `branch/ahead/behind` · `tasks[]` (manifest, setup status, params, secretRefs,
destructive) · `runs[]` (status, stream, reconnect token) · `preview{route,viewport,runtime[]}`.
Auth: one bearer device credential (30-day, revocable); token/model states from the server.

## 8 · Build order
1. **Shell + Session + Changes** — the flush-nav/theme-rail frame, the Claude Code dock, and the
   semantic-diff Changes screen (the pillar). One theme (Indigo) first.
2. **Files · Preview · Tasks (MVP)** — tree+metadata; device-framed preview + runtime→agent;
   task palette + run view (saved scripts + Run).
3. **Theming (5 rails) · typed task manifests · agent-invocable tasks** — `[data-di-theme]`;
   param forms + secret refs + confirm gates + guided auth; `run_task` MCP tool + save-as-task.

## 9 · Integration / open questions
1. **Tighten handoff** — exact Claude Code command/URI to focus its panel + pre-fill a prompt.
2. **History/pins/search source** — Claude Code transcript (JSONL) vs DI event log; pin anchor id.
3. **Task runner server** — container provisioning cache, guided device-flow auth, secret store +
   redaction, reconnect-safe streaming, `run_task` MCP surface, `tasks.json` export.
4. **Preview runtime bridge** — how console/network errors are captured and posted to the agent.
5. **Endpoints assumed:** review-queue list / mark-reviewed / commit; device-credential
   issue/revoke; TOTP enrol/verify/disable + throttle; per-session caveman + RTK savings.

## 10 · Package contents
- `README.md` — this spec (self-sufficient).
- `THEMES.md` — the five rail themes (exact hex + application rules).
- `TASK_RUNNER.md` — the Tasks surface contract + all states.
- `tokens.css` — DI token set incl. `--di-rail-*` theme blocks.
- `Development Intelligence.dc.html` — the hi-fi design reference (open in the design tool).
- `uploads/taskrunnerdesign.md` (in project root) — the original task-runner design note.
