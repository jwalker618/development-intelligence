# The IDE layer — VS Code fork + DI extension

An IDE for the new operating paradigm: you don't trade on your own typing —
you trade on how fast you can **review, validate, and steer** agent-written
code. VS Code is the foundation (a patch-based fork, not a rebuild); the
paradigm layer is Development Intelligence's own.

**Status:** extension + control-plane integration built and verified end-to-end
in a real VS Code server build (chat with live Claude Code, native approvals,
verbosity dial writing the caveman flag, review queue → diff). Fork scaffold
ready; desktop builds run in CI in the fork's own repository.

## The three pieces

```
┌────────────────────────────────────────────────────────────┐
│  DI IDE (VS Code fork · desktop + web)                 │
│  └─ di-ide extension (extension/)                    │
│     · Agent panel — chat, tool cards, Allow/Always/Deny    │
│     · Verbosity dial — caveman off/lite/full/ultra in the  │
│       status bar, savings meter beside it                  │
│     · Review queue — every agent edit → diff → keep/revert │
│     · Multi-repo workspaces — N sessions, one window       │
├────────────────────────────────────────────────────────────┤
│  Control plane (../server — same repo)                 │
│  · sessions (repo checkouts) · headless Claude Code via    │
│    the Agent SDK · caveman mode + savings · auth/MFA ·     │
│    Claude subscription token (survives redeploys)          │
├────────────────────────────────────────────────────────────┤
│  Environment (Railway container)                           │
│  · caveman (your fork) + RTK + Claude Code provisioned on  │
│    a volume — the optimisation lives HERE, so every        │
│    surface (IDE, phone PWA) inherits it                    │
└────────────────────────────────────────────────────────────┘
```

The phone PWA (../src — same repo) stays the mobile companion: same sessions, same
agent, same caveman — triage on the phone, review in Development Intelligence.

## Why a fork and not an extension alone

The extension carries the paradigm; the fork carries the *posture*:
review-first defaults (no trust dialogs, agent panel as the home surface, no
welcome tours), product identity, and desktop builds. Everything else —
editor, search, diff, git, terminal, LSP, multi-root — is unpatched upstream
VS Code. See `fork/README.md` for the patch-based model.

## Dev loop

```bash
cd extension
pnpm install && pnpm build && pnpm package     # → di-ide.vsix
# test against any VS Code server (code-server shown):
code-server --install-extension di-ide.vsix
```

Point the extension at a control plane: settings → `di.serverUrl`
(defaults to `http://127.0.0.1:4870`), then "Development Intelligence: Sign in" with your
master token — it's exchanged for a revocable 30-day device credential.

## Verified behaviour (Playwright against a real VS Code server build)

1. Development Intelligence container in the activity bar; Agent + Review queue views.
2. Sign-in → device credential in VS Code SecretStorage.
3. Chat: message → streamed reply from real headless Claude Code.
4. Verbosity dial: status bar shows `⛏ CAVEMAN:<MODE>` + savings; picking
   Ultra writes the flag file caveman's hooks read.
5. Review queue: agent/file edits appear with a badge; click → HEAD↔working
   diff; inline revert and mark-reviewed.
