# Development Intelligence

An IDE for the new operating paradigm: you don't trade on your own typing —
you trade on how fast you can **review, validate, and steer** agent-written
code, with the caveman + RTK token-economy stack applied to every reply on
every surface. Formerly prototyped as "Grotto" inside the generate-web
monorepo; this repo is the product's home.

## The stack

```
┌──────────────────────────────────────────────────────────────┐
│  DI IDE (ide/ — VS Code fork · desktop + web)                │
│  └─ di-ide extension                                         │
│     · Agent panel — chat, tool cards, Allow/Always/Deny      │
│     · Verbosity dial — caveman off/lite/full/ultra + savings │
│     · Review queue — every agent edit → diff → keep/revert   │
│     · Multi-repo workspaces — N sessions, one window         │
├──────────────────────────────────────────────────────────────┤
│  Mobile companion (src/ — phone PWA)                         │
│  · control room, native agent chat, files, git, preview      │
├──────────────────────────────────────────────────────────────┤
│  Control plane (server/)                                     │
│  · sessions (repo checkouts) · headless Claude Code via the  │
│    Agent SDK · caveman mode + savings API · login/MFA ·      │
│    Claude subscription token, stored once, survives deploys  │
├──────────────────────────────────────────────────────────────┤
│  Environment (Dockerfile → Railway)                          │
│  · caveman (jwalker618 fork) + RTK + Claude Code provisioned │
│    on a volume — optimisation lives HERE, every surface      │
│    inherits it                                               │
└──────────────────────────────────────────────────────────────┘
```

## Layout

```
├── server/            control plane (Node): sessions, agent, auth, doctor
├── src/               mobile companion PWA (React/Vite)
├── ide/
│   ├── extension/     di-ide VS Code extension (the paradigm layer)
│   └── fork/          patch-based VS Code fork scaffold + CI builds
├── scripts/           RTK installer, statusline wiring
├── Dockerfile         the provisioned environment (build from repo root)
├── railway.json       Railway service config (root directory = repo root)
├── DEPLOY.md          full Railway deployment guide
└── DESIGN.md          canonical UX spec (Claude Design source of truth)
```

## Deploying

See **DEPLOY.md**. Migrating from the generate-web deployment: point the
Railway service at this repo, clear the old "Root Directory", set Config file
path to `railway.json` — the volume (Claude token, caveman state, sessions)
carries over untouched.

## Naming note

Internal identifiers (`GROTTO_TOKEN`, `GROTTO_HOME`, `$GROTTO_*` env vars, the
`.grotto-provisioned` marker) keep the legacy prefix so existing volumes and
deployments keep working. Rename them only as a coordinated breaking change.
User-facing surfaces all say Development Intelligence.
