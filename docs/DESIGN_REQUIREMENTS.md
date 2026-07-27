# Development Intelligence — design requirements for the new surfaces

**For:** Claude Design.
**Scope:** every screen, modal, panel and control introduced since the Phase-5
handoff — multi-repo sessions, the leash, the context meter, rewind, the live
task panel, the new transcript row types, and the extended diagnostics.

**Status of what exists today:** all of it is **built and working against the
real API**. What is described here is functional but designed by an engineer
inside the existing token vocabulary. The ask is a proper design pass: layout,
hierarchy, states, motion, copy, and the phone form factor — not a green-field
invention.

---

## 0 · Read this first

### The product thesis, restated

DI is a **review-first agentic IDE**, phone-first. The agent does the typing;
the human does the deciding. Every surface below exists to answer one of three
questions:

1. **What is about to happen?** (the leash, the approval card, plan mode)
2. **What just happened?** (the transcript, the changes list, the receipts)
3. **Can I undo it?** (rewind)

A surface that does not serve one of those is decoration.

### Non-negotiables

- **Never invent a number.** Every figure on screen traces to something the SDK
  or git actually reported. Where there is no honest number, the UI says so in
  words (see "Spend ceiling is unavailable on subscription auth"). If a design
  needs a number to look right, that is a signal to change the design, not to
  find a number.
- **Never imply a capability we don't have.** The rewind card says the
  transcript does *not* move with the files, because it doesn't.
- **The phone is the primary target.** Everything below is currently laid out
  for a 1440px desktop. The 340px rail and the anchored menus need a real
  small-screen answer, and several of these surfaces have none yet.
- **Coral is the action colour** and stays constant across all five rail
  themes. Keep/revert green and red likewise.

### Existing vocabulary to build on

Tokens live in `src/di/tokens.css`. The pieces these surfaces already reuse:
`RailScroll` / `RailDock` / `MainColumn` (Shell), `di-menu` anchored popovers,
`di-eyebrow` section labels, `di-mono` for anything machine-authored, `KpiTile`,
`SampleChip`, the `di-pulse` liveness animation.

---

## 1 · Multi-repo sessions

**What changed:** a session was one repo. It is now an ordered list. The first
checkout is the **primary** — the agent's working directory and the session's
identity. The rest are mounted alongside so the agent can read and edit across
all of them in one conversation. Cap: 6.

### 1.1 New-session modal (replaces the branch modal)

*Current state:* `src/di/frontdoor/SessionsHome.tsx` → `SetupModal`.

Requirements:

- Picking a repo from the hero search opens this modal with that repo as the
  primary. The modal is where the session is actually configured.
- Each row: repo name, a branch field (blank = default branch), and — for
  non-primary rows — promote and remove affordances.
- **The ordering is load-bearing and must read as such.** The primary is not
  "the first one"; it is where the agent stands. The current design uses a
  coral `PRIMARY` badge and an up-arrow to promote. This is the weakest part of
  the current design and the highest-value thing to solve: users will not
  understand why order matters unless the design tells them.
- An inline "Add another repository…" search that excludes repos already
  chosen.
- Footer copy changes with count: one repo gets the existing worktree
  reassurance; several get "The agent works in *X* and can read and edit the
  other N alongside it."
- At the cap, the add row is replaced with a plain statement of the limit.

**Open design questions:**
- Is a list the right shape, or should the primary be visually separated from
  the secondaries entirely (a "workspace" card with satellites)?
- Should branch be per-repo at creation time at all, or is that a rare enough
  need to move behind a disclosure?

### 1.2 Session cards (Sessions Home)

A multi-repo session currently shows the primary's name plus a `+2` chip with
the full list on hover. Hover is not a phone interaction. Needs a real answer.

### 1.3 Repositories section (nav dropdown)

*Current state:* `src/di/Shell.tsx` → `ReposSection`.

- Lives inside the existing nav dropdown, between Sessions and This session.
- Lists every checkout with its branch; primary is marked and cannot be
  removed; failed clones show their error in place of the branch.
- "Add repository" expands into an inline search. Adding clones in the
  background — **this takes seconds to minutes** and the current design has
  only a placeholder change ("Cloning…"). It needs a real progress state.
- Removing deletes the checkout from disk. It is currently a bare `×` with no
  confirmation. **It should have one** — this destroys uncommitted work.

**Open design question:** the nav dropdown is now carrying sessions, repos,
views, and settings. Is it over-loaded? Does Repositories want to be its own
surface at multi-repo scale?

### 1.4 Files — one tree per checkout

*Current state:* `src/di/screens/Files.tsx`.

- Each checkout renders as a collapsible root; the primary is marked.
- Selected-file header shows `repo/path` for non-primary files.
- New files land in the checkout you are currently looking at.

**Open design question:** with 6 repos this is a very long tree. Is there a
repo switcher instead of stacked roots? A filter?

### 1.5 Changes — rows carry their repo

- Rows are prefixed `repo/path` when the session is multi-repo, plain `path`
  when it isn't.
- Review state is keyed by (repo, path) — two repos' `src/index.ts` are
  distinct rows.
- **Commit & sync commits every checkout that has changes**, sequentially, and
  names the repo in any failure. The button currently gives no indication that
  it is about to touch three repositories. It should.
- The branch pill in the rail shows only the primary's branch. With several
  repos on several branches that is under-informative.

---

## 2 · The leash — permission mode, read-only, budget

*Current state:* `src/di/screens/Session.tsx` → `LeashPill`, in the chat header.

**What it is:** how much the agent may do without asking. This is the control a
phone-first reviewer sets *before putting the phone in their pocket*, which
makes it arguably the most important control in the product — and it is
currently a small pill competing with the model and effort pickers.

Four modes, plus an orthogonal read-only switch:

| Mode | Meaning |
|---|---|
| Ask me | Approve every state change (default) |
| Auto-accept edits | File edits go through; commands still ask |
| Plan first | Propose before touching anything |
| Fail closed | Deny anything not pre-approved |

- **`bypassPermissions` is never offered.** A review-first IDE has no use for a
  mode that removes the human, and the session is locked out of it at the SDK
  level. Do not design an "advanced" affordance that reintroduces it.
- **Read-only review is not a mode** — it *removes* Write, Edit and Bash from
  the session. Verified: asked to write a file, the agent tried Write, tried to
  smuggle it through a subagent, and the file was never created. The design
  should carry that strength: this is a guarantee, not a preference.
- **Spend ceiling appears only when cost figures are real.** On subscription
  auth the SDK's dollar figures are notional, so the section is replaced by a
  sentence explaining why there is no ceiling. Do not design a disabled input.

**Requirements for the design pass:**
- The pill must communicate *current posture at a glance* — the difference
  between "Ask me" and "Fail closed" is the difference between an agent that
  waits and an agent that refuses, and both currently look like a grey pill.
- Read-only needs to visibly dominate the mode choice when on (it disables the
  modes today, which is correct but under-expressed).
- **Phone:** the header is now three pills (leash, effort, model) plus a
  working/stop chip. That does not fit. Needs a real small-screen composition.

**Open design question:** should the leash be part of the pre-flight of a
session ("how should this run?") rather than only a live header control?

---

## 3 · Context meter

*Current state:* rail panel, `ContextMeter`.

Shows: percentage of the real window, absolute tokens, the three largest
categories, an auto-compact warning above 85%, and the plan rate-limit window
when the CLI reports one.

- The categories are CLI-authored strings ("System tools", "Skills",
  "Autocompact buffer", "Free space") — the design cannot assume a fixed set.
- **The warning matters more than the number.** Compaction is where an agent
  quietly forgets what you told it forty turns ago. Crossing 85% should feel
  like something worth acting on.
- The rate-limit line ("Plan window: 62% used · resets 14:20") only exists on
  subscription auth. It is currently a footnote in the same panel; it may
  deserve to be its own thing.

**This panel replaces the old "% context saved" KPI**, which was fabricated.
There is no counterfactual anywhere in the SDK for what a turn would have cost
without caveman, so we show what the window actually holds. Any design that
reintroduces a savings percentage is reintroducing a lie.

---

## 4 · Rewind — the undo

*Current state:* `UserBubble` in `src/di/screens/Session.tsx`.

**The flagship review affordance.** Before this, DI had no undo over agent
edits at all.

The flow:

1. Every user message carries a rewind anchor. `↩ rewind here` sits under the
   bubble, deliberately quiet.
2. Tapping it runs a **dry run** and shows a preview: *"Restores 3 files
   (+12 −40) to their state before this message. The conversation stays as it
   is — only files move."* Plus the file list.
3. Confirm restores. A divider row lands in the transcript: *"Rewound · 3 files
   restored · +12 −40"*.

**Non-negotiable copy points:**
- The transcript does **not** rewind with the files. There is no counterpart in
  the SDK. The card says so; do not soften it.
- Historical messages from before this feature have no anchor, and the
  affordance is simply absent for them rather than present-and-dead.

**Requirements for the design pass:**
- The current preview is a small amber card anchored to the bubble. For a
  destructive action with a real blast radius this may be under-weighted —
  but a full-screen modal for an undo may be over-weighted. Find the level.
- The file list truncates at 6. Long lists need a real answer.
- There is no post-rewind "undo the undo". Should there be? (The SDK offers
  none; it would have to be a git stash on our side.)
- **Phone:** the preview card is 280px anchored to a right-aligned bubble.

**Explicitly out of scope:** wiring rewind to the per-hunk Revert button in
Changes. Rewind restores *everything the agent touched since that message*, so
a button labelled "Revert" on one hunk row doing something far larger is
exactly the mislabel this product exists to prevent.

---

## 5 · New transcript row types

Four kinds of row now appear in the conversation that the Phase-5 design did
not cover. Each currently has a functional but unstyled treatment.

| Row | Why it exists | Current treatment |
|---|---|---|
| **Blocked** | A tool was auto-denied by a rule, mode or classifier — `canUseTool` was never called, so without this the agent just looks like it underperformed | Red-bordered strip: `blocked · Bash` + the reason |
| **Notice** | A banner from the loop — most often a **hook's block reason**. Before this, a caveman/RTK hook could block a turn and the phone showed a prompt that appeared to do nothing | Amber (warning) or slate (info) strip; appends "· the turn stopped here" when it halted execution |
| **Compacted** | The context window was summarised. This changes what the agent remembers and used to be invisible | Centred rule: `Context auto-compacted · 142k → 38k tokens` |
| **Rewound** | Receipt for a completed undo | Centred amber rule: `Rewound · 3 files restored · +12 −40` |

**Requirements:**
- These are *system* rows in a conversation of *human* and *agent* rows. They
  need a third visual register that reads as neither.
- Blocked and Notice are actionable-adjacent (the user may need to change the
  leash or fix a hook); Compacted and Rewound are pure receipts. That
  distinction is not currently expressed.

---

## 6 · Hook liveness

*Current state:* rail chips, `HookLiveness`.

One chip per hook, showing its **last run**: green for success, red for
failure, with the event and exit code on hover.

- This is the honest answer to "did caveman actually fire?" — a boolean per
  run, never a synthesised percentage.
- **Nothing renders until a hook has actually run.** A session with no hooks
  configured says nothing rather than implying failure. Preserve that.

**Open design question:** it currently sits between the context meter and the
caveman dial, which is where a user would look for "is my efficiency tooling
working" — but it is three tiny chips carrying an important claim.

---

## 7 · Tasks — the live "In flight" section

*Current state:* `src/di/screens/Tasks.tsx` → `InFlight`, above the palette.

**Critical constraint:** this section is the agent's own subagents and
background commands. It is **not** the user-defined runbook runner that
`docs/task-runner-design.md` specifies and the palette below it previews.
The palette is still seeded sample data and **must keep its `SAMPLE` chip**.

Two different things now share one screen. Resolving that honestly is the
design work:

- Do they belong on the same screen at all?
- If yes, how does the boundary read so a user never mistakes a live subagent
  for a configured runbook, or vice versa?

Rows show a pulsing dot while running, the task label, and its status/detail.
Nothing renders when nothing is running.

---

## 7a · The composer's three chip surfaces

Three different kinds of chip now surround the message box, and they are
currently indistinguishable from each other. That is the design problem.

| Chip | Source | Behaviour | When |
|---|---|---|---|
| **Starter chips** | The repo's **real** slash commands with real descriptions (`supportedCommands()`) | Sends immediately | Empty conversation only |
| **Cold-start trio** | Hardcoded — "Explain this repo", "Add a failing test", … | Sends immediately | Empty conversation, *before* the CLI has reported anything. Measured: no command inventory and no suggestion exist until after turn one |
| **Follow-up chip** | The **model's own** suggested next step (`promptSuggestions`) | **Fills the composer; does not send** | After a turn, when the model offered one |

Requirements:

- The follow-up chip deliberately does not send. The model may suggest; the
  human still presses send. That distinction must be legible — right now it
  looks exactly like the starter chips, which do send.
- Starter chips currently show `/command` with the description on hover. Hover
  is not a phone interaction, and a bare `/docx` tells a user nothing.
- Commands taking arguments are filtered out entirely rather than offered as
  chips that would fail. If the design wants them, it needs an argument affordance.

## 7b · Turn-level liveness

Two small live indicators now sit beside the working·stop chip:

- **`thinking · 397`** — a real estimate of reasoning tokens for the turn in
  flight, from the SDK. It appears only while busy and only once non-zero.
- **Tool cards appear as the model starts emitting the call**, greyed at 60%
  opacity until the durable event arrives and replaces them. Long-running
  tools grow an elapsed counter past 3 seconds.

Requirements:

- The provisional-to-settled transition is currently a raw opacity flip. It is
  the most frequently-seen state change in the product and deserves a
  considered treatment.
- The header now holds: title, thinking pill, working·stop, leash, effort,
  model. See §9.1 — this is the composition problem, concentrated.

## 7c · The turn brake

"Stop after N turns" now sits in the leash menu beneath the spend ceiling.

- Unlike the ceiling it is offered on **every** auth, because a cheap model can
  loop a long time for very little money while producing enormous review churn.
- Two numeric limits in one menu (dollars and turns) with different
  availability rules is confusing as laid out. They are genuinely different
  brakes; the design should make that legible or separate them.

## 8 · Settings → Diagnostics, extended

*Current state:* `ClaudeCodeDetail` in `src/di/frontdoor/Settings.tsx`.

A per-session block below the existing doctor checks:

- **Connected as** — email / organisation / plan, or the provider when there is
  no first-party account.
- **Cost figures** — "billed rates" or "notional", with the reason.
- **Settings sources** — `user + project`, and a plain statement that `local`
  is deliberately not loaded because it would execute a freshly cloned repo's
  hooks. This is the one place a "works in my terminal, not in DI" report gets
  answered.
- Live slash-command / skill / MCP counts, CLI version.
- The CLI's own stderr, last 200 lines.

**Requirements:** this is a label-value table today. It is genuinely the
troubleshooting surface, so it should be designed as one — scannable, with the
"something is wrong here" rows able to announce themselves.

---

## 9 · Cross-cutting

### 9.1 The header is full

Session header now carries: title, working/stop chip, leash pill, effort
picker, model picker. On a phone this is the single biggest unsolved layout
problem in the product.

### 9.2 States every new surface needs

For each surface above, the design pass should specify:

- **Cold** — before Claude Code has started (context meter, account, and
  inventories all have no data source until the CLI is warm)
- **Empty** — no hooks have run, no tasks in flight, no changes
- **In progress** — cloning a repo, restoring files, waiting on a dry run
- **Failed** — a clone that failed, a rewind with no checkpoint, a hook that
  errored
- **Offline** — the WS is down but the session is alive

The current implementations have cold and empty states; in-progress and failed
are thin.

### 9.3 What we deliberately do not have

Do not design these; they were considered and rejected on evidence:

- A **plan-approval card**. Measured: `canUseTool` is never invoked in plan
  mode, so there is nothing to approve against. "Plan first" is honest as a
  mode — the agent proposes instead of acting — and approving means reading the
  plan and switching the pill back.
- A **"% context saved"** or **"+% tokens returned"** figure. No counterfactual
  exists.
- A **bypass-permissions** escape hatch.
- **Fork / branch** UI. Not built; the workspace is not forked by
  `forkSession()`, so it needs a worktree story first.

---

## 10 · Priority for the design pass

1. **The leash** — most important control, weakest current expression, and the
   phone story is unsolved.
2. **Multi-repo primary/secondary** — the ordering is load-bearing and users
   will not infer it.
3. **Rewind preview** — right weight for a destructive action.
4. **The four system row types** — they need a third register.
5. **Tasks live-vs-palette boundary** — currently one screen, two products.
5b. **The three chip surfaces** — one of them does not send, and nothing says so.
6. **Header composition on phone** — blocks 1 and everything else.
7. Diagnostics as a real troubleshooting surface.

---

## Appendix · Where each surface lives

| Surface | File |
|---|---|
| New-session modal | `src/di/frontdoor/SessionsHome.tsx` → `SetupModal` |
| Repositories section | `src/di/Shell.tsx` → `ReposSection` |
| Multi-root file tree | `src/di/screens/Files.tsx` |
| Repo-prefixed changes | `src/di/screens/Changes.tsx` |
| Leash pill | `src/di/screens/Session.tsx` → `LeashPill` |
| Context meter | `src/di/screens/Session.tsx` → `ContextMeter` |
| Hook liveness | `src/di/screens/Session.tsx` → `HookLiveness` |
| Rewind | `src/di/screens/Session.tsx` → `UserBubble` |
| System transcript rows | `src/di/screens/Session.tsx` → `ChatBody` |
| Live tasks | `src/di/screens/Tasks.tsx` → `InFlight` |
| Starter / follow-up chips | `src/di/screens/Session.tsx` → `ChatBody`, `Composer` |
| Thinking pill + streaming tool cards | `src/di/screens/Session.tsx` header, `ChatBody` |
| Turn brake | `src/di/screens/Session.tsx` → `LeashPill` |
| Diagnostics detail | `src/di/frontdoor/Settings.tsx` → `ClaudeCodeDetail` |

Evidence for every claim about SDK behaviour in this document is in
`docs/SDK_SPIKES.md`, reproducible with `npx tsx scripts/spikes.mts`.
