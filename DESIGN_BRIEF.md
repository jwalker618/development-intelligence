# Claude Design session brief — Development Intelligence UX rework

**Audience:** a fresh Claude Design session. This file is your bootstrap
context — read it first, then `DESIGN.md` (the current canonical spec), then
skim the live implementation in `src/` and `ide/extension/`. Your job is to
produce the Development Intelligence design language and screen specs; the
build sessions (Claude Code) will implement from what you produce.

Repo: `jwalker618/development-intelligence` · working branch:
`claude/migration-dev-intelligence-3ol1dc`.

---

## 1. Product and the user's original spec

Development Intelligence is an IDE for a **new operating paradigm**: the user
is "not trading on my own coding skill anymore but instead my ability to
rapidly review and augment code." VS Code is, in their words, "overblown for
users that want to interact with agents and spend most of their time simply
reviewing / validating created code."

The five pillars of the original spec — every design decision should trace to
one of these:

1. **Review-first, not editor-first.** Agent edits arrive as a review queue
   of diffs (keep / revert / steer), not a file tree the user must navigate.
2. **Verbosity as a first-class control.** The caveman token-economy modes
   (off/lite/full/ultra) are tuned constantly — a one-click dial and a proud
   savings badge, never a config file.
3. **Multi-repo sessions.** Several repos composed into one working context.
4. **Seamless Claude subscription auth.** Never a login/trust/onboarding
   screen inside a session; one-time guided connect only.
5. **Works for a non-technical / new developer, on a phone as well as a
   desk.**

**Naming (explicit user decisions):** the product is **Development
Intelligence**. "Grotto" (the PWA prototype) and "Cavern" (a transient
extension name) are retired as product names. **caveman** remains the brand
of the token-economy *feature* (the dial, the badge, the ⛏ savings counter) —
it is shared with the user's separate `caveman` project and is not being
renamed.

---

## 2. What exists today (the surfaces you are designing for)

Two client surfaces, one control plane. All intelligence is server-side; the
clients are viewports.

### Phone PWA (`src/`) — functional MVP, Grotto-era visual design
- **Login → Home (control room) → Session** with tabs
  **Agent (native chat, default) · Term · Files · Git · Preview**.
- Agent tab: chat bubbles, tool-call cards, native **Allow / Always / Deny**
  approval card, streaming deltas, stop/interrupt, model pill.
- Term: raw terminal (secondary; the agent's workbench, not the hero).
- Home: session list with "needs you" flag when an approval is pending;
  diagnostics/repair; settings behind gear (Claude connect card, Security/MFA
  card, caveman controls).
- Auth: master token + optional TOTP → revocable 30-day device credential;
  guided Claude connect (paste-code form, never a raw OAuth URL in a
  terminal).

### VS Code IDE (`ide/`) — extension + thin fork
- **`di-ide` extension** contributes an activity-bar container with two
  views: **Agent** (chat webview — currently bare-bones HTML/CSS in
  `ide/extension/media/`) and **Review queue** (tree of changed files across
  all workspace roots → HEAD↔working diff, revert, mark-reviewed, badge
  count). Status bar: **caveman dial** (`⛏ CAVEMAN:ULTRA · savings`) →
  quick-pick. Commands: sign-in, set verbosity, compose multi-repo workspace.
- **Fork** (`ide/fork/`): patch-based on microsoft/vscode 1.96.4. Ships
  review-first defaults (workspace trust off, startup editor none) and bakes
  the extension in as a built-in. Everything else is stock VS Code — the
  paradigm layer is the extension, which must also run in stock VS Code and
  code-server.

---

## 3. Design sources and their status

| Source | Status |
|---|---|
| `DESIGN.md` | Canonical spec, **still titled/voiced "Grotto"** with placeholder tokens. Its **CONTRACT** sections and field rulings (v2.0 chat-first; v1.1 governs the Term tab) are fixed behavior. Everything non-CONTRACT is yours to elevate. |
| `docs/design-history/AUTH_MFA.md` | Auth/MFA screen handoff (login 2-step flow, Claude auth card, Security card) — built and shipped; treat as record of intent. |
| `docs/design-history/Grotto IDE UX design.zip` | Original IDE UX design exploration — reference, not canon. |
| `src/styles.css` | The implemented Grotto-era token set and components (~2300 lines). |
| `ide/extension/media/chat.css` | The extension webview's current minimal styling. |

Current placeholder brand: cave/caveman identity, `🪨`, warm near-black
darkness, single orange accent (`#f97316` family), system sans + mono, dark
only. **Free to evolve; keep dark-first and a confident single accent.**

---

## 4. The mandate — what this rework must produce

1. **A Development Intelligence identity.** The product outgrew "Grotto the
   cave PWA": it is now a product family (phone PWA + VS Code-based IDE +
   fork). Design the DI brand — name treatment, iconography (there is a
   placeholder `ide/extension/media/di.svg` and `public/icon.svg`), token
   system, voice — such that caveman remains a *feature brand inside it*
   (the dial/badge keep the ⛏/🪨 warmth) rather than the whole identity.
2. **The review-first surface, elevated.** Today's review queue is a
   functional tree. Design review as the product's hero loop: arrival of
   agent changes, triage (keep / revert / "ask agent to tighten"), diff
   reading on phone *and* in the IDE, staging/commit flows (roadmap:
   review-queue v2), and how "reviewed" state is communicated. This is the
   pillar the product is named for — spend your best thinking here.
3. **One design language across both surfaces.** The PWA and the extension
   webview/chrome currently share nothing visually. Produce a token +
   component vocabulary that renders in both (plain CSS; the webview also
   inherits VS Code theme variables — decide how DI tokens and
   `--vscode-*` variables coexist).
4. **Update `DESIGN.md` itself** — retitle to Development Intelligence,
   fold in the new identity and screens, keep every CONTRACT block and field
   ruling intact (they encode verified behavior). Add IDE-surface sections
   (agent panel, review queue, dial, workspace composer) which the spec
   currently lacks entirely.

## 5. Hard constraints (do not redesign these)

- **CONTRACT blocks and field rulings in `DESIGN.md`** — tab set and
  mounted-terminal rule, WS/REST chat protocol, approval semantics
  (Allow/Always/Deny; a pending ask flags the session "needs you"),
  session lifecycle. Server behavior in `server/` is fixed.
- **Copy rules:** light caveman voice only in celebratory/empty moments;
  **never** for errors, security, destructive confirmations, or MFA/auth
  copy — those are plain prose (mirrors caveman's auto-clarity rule).
- **Ergonomics:** one-thumb reach for frequent actions; interruptible by
  design (phones lock, sockets drop — every screen must read as "session
  still alive"); iOS realities recorded in `DESIGN.md` §5 (clipboard
  hangs, keyboard vs. terminal, explicit scroll affordances).
- **Token economy is a feature, not plumbing** — savings and modes are brand
  moments, surfaced with pride.
- **Extension portability:** the di-ide extension must look right in the DI
  fork, stock VS Code, and code-server. Don't design anything that needs
  fork-only chrome.
- **Verified flows that must not regress:** guided Claude connect, chat
  approval round-trip, dial → flag → status bar, review queue → diff open,
  MFA login. Redesign their *presentation* freely; their *steps* are proven
  on real devices and hard-won.

## 6. Suggested working order

1. Read `DESIGN.md` fully (contracts + rulings), then `src/App.tsx`,
   `src/components/SessionView.tsx`, `src/styles.css` for what's real.
2. Identity first (tokens, type, icon, name treatment) — everything else
   consumes it.
3. Review loop second (phone + IDE), then the agent chat surfaces, then
   Home/control room, then settings/auth reskin.
4. Emit: updated `DESIGN.md` (retitled, DI-branded, IDE sections added) +
   any screen-level handoff docs the build sessions will need. Follow the
   repo's existing spec style: CONTRACT markers, fidelity notes, explicit
   "free to evolve" boundaries.
