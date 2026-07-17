# The IDE layer — VS Code fork + official Claude Code extension + di-ide

An IDE for the new operating paradigm: you don't trade on your own typing —
you trade on how fast you can **review, validate, and steer** agent-written
code. VS Code is the foundation (a patch-based fork, not a rebuild); the
agent conversation is the **official Claude Code extension**
(`anthropic.claude-code`); the paradigm layer around it is Development
Intelligence's own `di-ide` extension.

**Status:** di-ide + control-plane integration verified end-to-end in a real
VS Code server build (verbosity dial writing the caveman flag, review queue →
diff). The earlier bespoke chat webview is removed — the official extension
owns the conversation (native diff approvals, plan mode, checkpoints, session
history), and di-ide hands off to it. Fork scaffold ready; builds run in CI
(`.github/workflows/build-di.yml`).

## The pieces

```
┌────────────────────────────────────────────────────────────┐
│  DI IDE (VS Code fork · desktop + web)                     │
│  ├─ anthropic.claude-code (provisioned from Open VSX)      │
│  │   · the agent conversation: diffs, plan mode,           │
│  │     checkpoints, approvals — Anthropic's native UX      │
│  └─ di-ide extension (extension/, baked in as built-in)    │
│      · Review queue — every agent edit → diff →            │
│        keep / revert / "ask agent to tighten" (pre-fills   │
│        a prompt in the Claude Code panel via its URI       │
│        handler)                                            │
│      · Verbosity dial — caveman off/lite/full/ultra in the │
│        status bar, savings meter beside it                 │
│      · Multi-repo workspaces — N sessions, one window      │
├────────────────────────────────────────────────────────────┤
│  Control plane (../server — same repo)                     │
│  · sessions (repo checkouts) · headless Claude Code via    │
│    the Agent SDK (phone chat) · caveman mode + savings ·   │
│    auth/MFA · Claude subscription token (survives          │
│    redeploys)                                              │
├────────────────────────────────────────────────────────────┤
│  Environment (Railway container)                           │
│  · caveman (your fork) + RTK + Claude Code provisioned on  │
│    a volume — the optimisation lives HERE, so every        │
│    surface (IDE, phone PWA) inherits it                    │
│  · scripts/provision-ide.sh installs both extensions into  │
│    the IDE server build (DI_IDE_DIR) at boot               │
└────────────────────────────────────────────────────────────┘
```

The phone PWA (../src — same repo) stays the mobile companion: same sessions,
same agent, same caveman — triage on the phone, review in Development
Intelligence. The official extension can't run there, so the PWA keeps the
control plane's Agent-SDK chat.

## Seamless auth (no login screens — ever)

The control plane stores a long-lived subscription token from guided connect
and injects it as `CLAUDE_CODE_OAUTH_TOKEN` (see `server/config.ts
sessionEnv`). Launch the IDE server with that env plus `CLAUDE_CONFIG_DIR`
and the Claude Code extension's bundled CLI inherits the token, the caveman
hooks, and the mode flag — signed in and optimised the moment the panel
opens.

## Why a fork and not an extension alone

The extensions carry the paradigm; the fork carries the *posture*:
review-first defaults (no trust dialogs, no welcome tours), product identity,
and desktop builds. Everything else — editor, search, diff, git, terminal,
LSP, multi-root — is unpatched upstream VS Code (pinned ≥1.98, the Claude
Code extension's floor; see `fork/upstream.json`). See `fork/README.md` for
the patch-based model. The official extension is provisioned at container
setup, not baked into the image — it's proprietary, and install-at-provision
keeps distribution clean.

## Dev loop

```bash
cd extension
pnpm install && pnpm build && pnpm package     # → di-ide.vsix
# test against any VS Code server (code-server shown):
code-server --install-extension di-ide.vsix
code-server --install-extension anthropic.claude-code   # the agent panel
```

Point di-ide at a control plane: settings → `di.serverUrl`
(defaults to `http://127.0.0.1:4870`), then "Development Intelligence: Sign in" with your
master token — it's exchanged for a revocable 30-day device credential.

## Verified behaviour (Playwright against a real VS Code server build)

1. Development Intelligence container in the activity bar; Review queue view.
2. Sign-in → device credential in VS Code SecretStorage.
3. Verbosity dial: status bar shows `⛏ CAVEMAN:<MODE>` + savings; picking
   Ultra writes the flag file caveman's hooks read.
4. Review queue: agent/file edits appear with a badge; click → HEAD↔working
   diff; inline revert and mark-reviewed.

Not yet re-verified after the official-extension adoption: the
provision-ide.sh install path and the "ask agent to tighten" URI handoff —
exercise both in the next code-server session.
