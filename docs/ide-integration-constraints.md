# IDE conversation features — what design can and cannot do

**For: the Claude Design session working on Development Intelligence's IDE surface.**
**Decision: Posture A — companion rail + hook bridge. Adopted, not up for redesign.**

This document is the guardrail. The IDE's agent conversation is the **official
Claude Code extension** (`anthropic.claude-code`) — a closed webview panel we
dock beside but **cannot render inside**. Every feature that feels like it
belongs "in the conversation" (pin, search, the caveman toggle) actually lives
*beside* it, in native VS Code views, reached through three narrow seams.

Design against this reality. The floating-modal-over-the-panel pattern is
**rejected** — see §1 for why and §2 for what replaces it.

---

## 0 · The one mental model to hold

> **VS Code is a docking system. The official panel is one dock. DI's features
> are other docks beside it — not overlays on top of it.**

Two separate bindings, often conflated:

- **Agent ↔ repo** (the session works on a repo checkout): FIXED. Not our concern here.
- **Agent ↔ conversation UI** (the official panel fronts the agent): the constraint this doc is about.

We do **not** own the conversation UI. We own everything docked around it.

---

## 1 · Why the floating modal is rejected

The design session drifted to a modal floating over the panel because the
features feel like conversation chrome. The modal is wrong because:

- It tries to *fake being inside* a panel we don't control.
- Modals don't persist — a pin list you have to re-summon is not a pin list.
- It fights the official panel for focus and z-index (VS Code webviews are
  iframes; overlaying one over another is a losing battle).

Replace the instinct "overlay the conversation" with "**dock a view next to it.**"

---

## 2 · What you MAY design (the canvas you own)

These are real, native, and yours to make beautiful:

| Surface | VS Code primitive | Use it for |
|---|---|---|
| **Pins rail** | Tree view in the DI activity-bar container (or secondary sidebar, right of Claude) | The 📌 list of saved messages/returns. Persistent, dockable. |
| **Search view** | Tree view or a webview view | Conversation search results (but read §5 first — may be redundant). |
| **Pin/result detail** | Virtual read-only document (a normal editor tab) | Show a pinned excerpt or search hit in full, with your styling, syntax highlighting, copy actions. |
| **Caveman dial** | Status-bar item (already built) + quick-pick | The verbosity toggle. This is **ambient**, not conversation chrome — see §4. |
| **Review queue** | Tree view (already built) | Unchanged; the review-first hero surface. |
| **Container chrome** | Activity-bar icon, view titles, welcome content, badges | DI's identity in the sidebar. |

You have full design control over **all of the above**: layout, icons, colours,
tree item shape, badges, hover cards, the virtual-document rendering, empty
states, ordering, grouping. This is a real canvas — it is simply *beside* the
conversation, docked, not floating.

**Docking guidance to specify:** the natural home is VS Code's **secondary
sidebar** (right side) so the Pins rail sits directly next to the Claude panel,
or the DI activity-bar container (left) alongside the Review queue. Design for
both narrow (icon + count) and expanded (excerpt preview) widths.

---

## 3 · What you MAY NOT design (hard walls)

Do not spec any of these — they cannot be built against the official panel:

- ❌ **A pin button on a message bubble.** We cannot add controls to the
  panel's messages. Pin *creation* is a typed command (§4), not a click on a bubble.
- ❌ **Inline highlights, ribbons, or gutter marks inside the conversation.**
  No access to the panel's DOM.
- ❌ **A modal or popover anchored to a specific message in the panel.**
- ❌ **"Scroll/jump to this exact message" inside the official panel.** There is
  no deep-link to a message *within* a session. The best we can do is resume the
  session and show the excerpt in a DI document (§4). Design the pin's "open"
  action around that reality, not around a jump-in-place.
- ❌ **Restyling the conversation itself** — bubbles, diffs, plan documents,
  approval prompts. That interior is Anthropic's product. DI styles the chrome
  around it, never its contents.
- ❌ **Live, real-time mirroring of the conversation** as it streams. DI reads
  the transcript from disk, which lands a beat after each turn completes. Design
  for "settled after the turn," not "live token-by-token."

---

## 4 · How pin CREATION works (the hook bridge)

Because there's no bubble button, pins are created through the **composer you
already have** — the official panel's input box — intercepted by a hook:

1. User types a natural-language trigger in the Claude composer, e.g.
   **"pin that"**, **"pin the last diff"**, **"pin your previous answer."**
   - Use **natural language, not a `/command`.** The official panel captures `/`
     for its own command menu, so a slash trigger collides. Design the trigger
     vocabulary as plain phrases.
2. DI's `UserPromptSubmit` hook catches the message *before it reaches the
   model*, reads the transcript to grab the referenced turn, writes the pin to
   DI's own store, and **blocks** the message from going to the model.
3. The block returns a confirmation — **"📌 Pinned: <summary>"** — which appears
   *inside the official panel* as the block reason. This is the one moment DI
   text shows inside Claude's panel, and it's a system confirmation, not chrome.

**Design implications you must account for:**
- The **trigger vocabulary** is a design artifact — decide the phrases, keep
  them unambiguous, document them where the user can discover them (a DI welcome
  view, a hover, the Pins rail empty state).
- The **confirmation** is a single line of text surfaced by the panel. You
  cannot style it. Design the *real* feedback (the pin appearing, animating in)
  in the **Pins rail**, which is where the user's eye should go.
- A pin record is `(session, turn reference, excerpt, optional note, timestamp)`.
  Design the rail item around those fields — nothing more is reliably available.

---

## 5 · How SEARCH works — and check redundancy FIRST

**The official panel already has keyword search over session history plus
resume.** Before designing anything, confirm what it covers. Do **not**
re-skin a search the user already has.

Design DI search only for what the official one lacks, e.g.:
- **Cross-session** search (theirs is oriented around picking a session).
- **Search within pins** only.
- **Semantic** / meaning-based search, if we invest in it.

Mechanics when we do build it: DI reads the transcripts from disk, renders hits
in a DI view, click-to-open shows the excerpt in a virtual document. Same
"resume the session, can't jump to the message" limit as §4 applies to results.

If the built-in search covers the need, **this feature can shrink to nothing** —
that's a win, not a gap. Flag it to the user rather than building a duplicate.

---

## 6 · The caveman toggle — decouple it entirely

The caveman verbosity toggle is **ambient global state**, not conversation
chrome. It is a **status-bar control** (already built as the dial) that writes a
flag file the hooks read every turn. It has nothing to do with any individual
message.

**Instruction to the design session: remove the caveman toggle from the
pin/search cluster.** It is a status-bar affordance + quick-pick, designed on
its own terms (mode, savings meter). Grouping it with pin/search is what made
the whole set feel like it needed a conversation overlay. It doesn't.

---

## 7 · The three seams (reference — so nobody proposes a fourth)

Everything above is built from exactly these. If a design idea needs a seam not
on this list, it cannot be built without abandoning Posture A:

1. **Hooks (intercept):** `UserPromptSubmit` sees and can block composer input →
   powers pin creation and the in-panel confirmation.
2. **Transcript on disk (read):** the JSONL the CLI + extension share on the
   volume → powers pins' content, search, and the detail documents. Read-only,
   settles after each turn.
3. **URI handler (write):** `vscode://anthropic.claude-code/open?prompt=…&session=…`
   → powers "act on a pin" and "open this search result's session." One-way
   injection; no message-level targeting.

---

## 8 · One-paragraph brief for the design session

> Design DI's pin, search, and caveman features as **native VS Code views and
> status-bar controls docked beside the official Claude Code panel — never as
> overlays on it.** You cannot touch the conversation's interior: no bubble
> buttons, no inline marks, no jump-to-message. Pins are created by a
> natural-language trigger ("pin that") typed into Claude's own composer and
> caught by a hook; they appear in a DI **Pins rail** (a tree view), and open as
> DI documents. Search is a DI view **only for what the panel's built-in search
> lacks** — check first. The caveman toggle is a **status-bar control**, not
> conversation chrome — design it separately. Full creative control over every
> docked surface; zero access to the panel's contents.
