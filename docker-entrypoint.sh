#!/bin/sh
# Grotto entrypoint.
#
# When CLAUDE_CONFIG_DIR points at a persistent volume, Claude Code's config
# (OAuth subscription credentials, caveman hooks, statusline, mode flags)
# lives there instead of the ephemeral container filesystem — so a Claude
# login done once from a Grotto terminal survives every redeploy.
#
# The image installs caveman+RTK into /root/.claude at build time, which a
# volume-backed CLAUDE_CONFIG_DIR shadows. Provision the volume from the
# caveman clone baked into the image. Success is recorded in a marker file —
# NOT inferred from settings.json existing, because a partially failed install
# creates settings.json and would otherwise never be retried (sticky failure).

if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  mkdir -p "$CLAUDE_CONFIG_DIR"
  MARKER="$CLAUDE_CONFIG_DIR/.grotto-provisioned"
  LOG="$CLAUDE_CONFIG_DIR/.grotto-provision.log"
  if [ ! -f "$MARKER" ] && [ -d /opt/caveman ]; then
    echo "[grotto] provisioning caveman into $CLAUDE_CONFIG_DIR"
    # Upstream caveman's installer flags drift — probe --help and pass only
    # flags that exist. Output goes to a log on the volume so Settings →
    # Diagnostics can show WHY a boot-time provisioning failed.
    HELP=$(node /opt/caveman/bin/install.js --help 2>/dev/null </dev/null || true)
    FLAGS="--non-interactive"
    case "$HELP" in *--with-hooks*) FLAGS="--with-hooks $FLAGS" ;; esac
    # (--with-rtk deliberately not passed: Grotto owns RTK via install-rtk.)
    # Claude Code is the only agent Grotto wires. --only claude skips the
    # gemini/codex installers — gemini's "trust this workspace?" prompt reads
    # stdin even under --non-interactive and can wedge an unattended boot.
    case "$HELP" in *"--only"*) FLAGS="--only claude $FLAGS" ;; esac
    echo "[grotto] installer flags: $FLAGS"
    # </dev/null + timeout: NOTHING interactive may ever block the boot.
    if timeout 300 node /opt/caveman/bin/install.js $FLAGS </dev/null > "$LOG" 2>&1; then
      date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MARKER"
      echo "[grotto] provisioning complete"
    else
      echo "[grotto] provisioning failed or timed out — retries next boot; details in Diagnostics."
    fi
    cat "$LOG"
  fi

  # RTK is installed independently of caveman (upstream dropped --with-rtk).
  # Runnability check, not existence: a gnu binary on too-old glibc exists but
  # can't execute — install-rtk removes it and finds a musl build instead.
  if ! rtk --version >/dev/null 2>&1 && command -v install-rtk >/dev/null 2>&1; then
    echo "[grotto] installing RTK (layered fallbacks)"
    timeout 600 install-rtk </dev/null >> "$LOG" 2>&1 \
      || echo "[grotto] RTK install best-effort failed — see Diagnostics"
  fi
  if rtk --version >/dev/null 2>&1 && ! grep -q '"rtk' "$CLAUDE_CONFIG_DIR/settings.json" 2>/dev/null; then
    timeout 60 rtk init -g </dev/null >> "$LOG" 2>&1 || true
  fi
fi

# Wire the model-recording statusline wrapper (idempotent, best-effort).
node scripts/wire-statusline.mjs || true

# IDE server provisioning (official Claude Code extension + di-ide) — only
# when an IDE build ships in the image (DI_IDE_DIR). Best-effort, marker-based.
if [ -n "${DI_IDE_DIR:-}" ]; then
  sh scripts/provision-ide.sh || echo "[di-ide] provisioning best-effort failed"
fi

exec pnpm start
