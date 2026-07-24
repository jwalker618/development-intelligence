# Surrounding surfaces & states (turns 36–42)

Everything a user needs to **get into**, **authenticate**, **configure**, and every
**non-happy-path state** around the five in-session screens (35a–35e). Source of the gap
list: `DESIGN_GAPS.md`. Each row names the screen id in `Development Intelligence.dc.html`.

Two structural picks the user made here:
- **Sessions Home = the launcher** (start-a-session-first: repo search + recent grid).
- **Login = the progressive signal card** (centered, animated signal motif, token → code).
- **Nav dropdown does triple duty:** the flush-nav button opens **session quick-switch +
  the five views + Settings/Appearance** (37f). Settings lives behind that gear; Appearance
  lives inside Settings.

---

## A · Session lifecycle (turn 37) — the layer that wraps the workbench
| id | Surface | Notes |
|----|---------|-------|
| 37a | Sessions Home — populated | launcher: repo search + "Continue" recent grid; needs-you dot floats a session |
| 37b | Sessions Home — empty | "no sessions yet" first-run |
| 37c | New session — repo + branch | repo chosen (GitHub-connected list first, free-type `owner/repo` fallback) → base-branch pick |
| 37d | New session — provisioning | clone → container → Claude Code/hooks → dev server, per-step progress; "run in background" |
| 37e | New session — error | provisioning failed (e.g. GitHub App not installed) → Install & retry |
| 37f | **Session switcher** | flush-nav dropdown: Sessions quick-switch + New · the 5 views · All sessions / Settings / Appearance footer |
| 37g | Close / delete session | destructive confirm, **plain prose**: warns uncommitted changes + chat loss; branch safe on GitHub |

## B · Auth & connect (turn 38) — on the 36e signal card
| id | Surface | Notes |
|----|---------|-------|
| 36e | Login — token entry (step 1) | 30-day device credential; "code next" |
| 38a | Login — MFA code (step 2) | 6-digit; expiry + resend |
| 38b | Login — throttle / lockout | countdown, inputs disabled, recover-access link |
| 38c | Login — 401 re-auth | session expired; app dimmed behind; "your sessions are safe" |
| 38d | Connect Claude — awaiting | guided device flow: open `claude.ai/device`, code, spinner |
| 38e | Connect Claude — connected | account + plan, token-on-volume note, disconnect |
| 38f | Connect Claude — timed out | expired device_code → start over / use token |
| 38g | Manual Claude token | paste sk-ant-… (masked), stored/clear, redaction note |

All auth/security copy is **plain prose** — no caveman voice.

## C · Settings (turn 39) — one modal, four sections (from the 37f gear)
| id | Section | Notes |
|----|---------|-------|
| 39a | Claude authentication | status · reconnect · manual token · disconnect |
| 39b | Security | MFA enabled + disable · device credentials (revoke) · sign out |
| 39c | Security — enrol 2FA | TOTP: QR + manual otpauth key + confirm code |
| 39d | Diagnostics & repair | caveman/RTK health chain (CLI · RTK · hooks · **statusline (fail)** · marker) + Repair + output |
| 39e | Appearance | Dark / Light / System + the five rail-colour themes |

## D · Empty / loading / offline / error (turn 40) — the 5 screens' real states
| id | State |
|----|-------|
| 40a | Loading — first control-plane fetch (skeletons) |
| 40b | Offline / reconnecting — "session still alive" over the dimmed session |
| 40c | Session — Claude not connected (prompt to connect) |
| 40d | Session — no messages yet (suggested first prompts) |
| 40e | Changes — nothing to review (clean tree) |
| 40f | Changes — no file selected |
| 40g | Files — binary / too-large (no preview; download) |
| 40h | Files — loading tree (skeleton) |

## E · In-screen flows (turn 41)
| id | Flow | Notes |
|----|------|-------|
| 41a | Model picker | model pill → Sonnet/Opus/Haiku switcher; "applies to new messages" |
| 41b | File editor | edit mode, dirty dot on tab + tree, Save/Cancel (⌘S) |
| 41c | New file / folder / upload | segmented dialog; path-prefixed name; upload dropzone |
| 41d | Task run — streaming | live output, secrets masked, **Interrupt** |
| 41e | Task run — structured prompt | mid-run Allow/Deny card (never raw TUI) + **reconnected** chip |
| 41f | Save-as-task | promote a run: values→params, secrets→refs, mark destructive |
| — | Task guided auth | reuses the **38d** device-flow pattern |

## F · Preview for real (turn 42) — beyond the mock frame
| id | State | Notes |
|----|-------|-------|
| 42a | No dev server running | most common; inviting empty state + `pnpm dev` Start |
| 42b | Pick a dev server | multiple ports detected (Vite / Storybook / API) + add-port |
| 42c | Rebuilding | hot-reload overlay over the last frame |
| 42d | Crashed | build error, stack, Send to agent / Retry |
| 42e | **Runtime error → agent task** | captured console error → pre-filled agent prompt + attach network log (the review-first payoff) |

Design runs ahead of the backend here: the preview proxy exists; the **runtime-capture bridge**
and typed-task/agent-invocation backends are build-ahead (see README §9).
