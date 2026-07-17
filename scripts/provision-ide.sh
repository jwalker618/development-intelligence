#!/bin/sh
# Provision the Development Intelligence IDE server (the VS Code fork's reh-web
# build, or code-server in dev) with its extension pair:
#
#   1. anthropic.claude-code — the official Claude Code extension. It owns the
#      agent conversation in the IDE (native diffs, plan mode, checkpoints).
#      Installed from the configured gallery (the fork's product.json points at
#      Open VSX), with a direct Open VSX download as fallback for builds whose
#      product.json has no gallery. NOT baked into the fork image — it is
#      proprietary; install-at-provision keeps distribution clean.
#   2. di-ide.vsix — our paradigm layer (review queue, caveman dial, workspace
#      composer), when a built vsix is present.
#
# Also writes IDE Machine settings so stock/code-server builds match the fork's
# review-first defaults, and so the Claude Code extension needs no interaction:
# auth comes from CLAUDE_CODE_OAUTH_TOKEN in the server process env (see
# server/config.ts sessionEnv) — launch the IDE server with that env and the
# extension's bundled CLI inherits token, CLAUDE_CONFIG_DIR, and the caveman
# hooks that live there.
#
# Same contract as the caveman provisioning in docker-entrypoint.sh: marker
# file for success (never inferred from partial state), log on the volume for
# Diagnostics, best-effort — an IDE provisioning failure must never block boot.
#
# Env:
#   DI_IDE_DIR             IDE server build root (contains bin/). Required.
#   DI_IDE_EXTENSIONS_DIR  extensions dir (default $GROTTO_HOME/ide/extensions)
#   DI_IDE_USER_DATA_DIR   server data dir  (default $GROTTO_HOME/ide/data)
#   DI_IDE_VSIX            path to di-ide.vsix (default: skip if absent)

set -u

[ -n "${DI_IDE_DIR:-}" ] || { echo "[di-ide] DI_IDE_DIR not set — skipping IDE provisioning"; exit 0; }
[ -d "$DI_IDE_DIR" ] || { echo "[di-ide] $DI_IDE_DIR missing — skipping"; exit 0; }

HOME_DIR="${GROTTO_HOME:-$HOME/grotto}"
EXT_DIR="${DI_IDE_EXTENSIONS_DIR:-$HOME_DIR/ide/extensions}"
DATA_DIR="${DI_IDE_USER_DATA_DIR:-$HOME_DIR/ide/data}"
MARKER="$EXT_DIR/.di-ide-provisioned"
LOG="$HOME_DIR/ide-provision.log"
mkdir -p "$EXT_DIR" "$DATA_DIR/Machine" "$(dirname "$LOG")"

# The server launcher name depends on product.json; probe bin/ instead of
# hardcoding (code-server-oss for stock code-oss, code-server for code-server).
BIN=""
for candidate in "$DI_IDE_DIR"/bin/*; do
  [ -f "$candidate" ] && [ -x "$candidate" ] && { BIN="$candidate"; break; }
done
[ -n "$BIN" ] || { echo "[di-ide] no executable in $DI_IDE_DIR/bin — skipping"; exit 0; }

install_ext() { # $1 = extension id or vsix path
  timeout 300 "$BIN" \
    --extensions-dir "$EXT_DIR" \
    --user-data-dir "$DATA_DIR" \
    --install-extension "$1" </dev/null >> "$LOG" 2>&1
}

# Machine settings: idempotent overwrite is fine — this file is owned by
# provisioning, user settings live in User/settings.json and win over Machine.
cat > "$DATA_DIR/Machine/settings.json" <<'EOF'
{
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "telemetry.telemetryLevel": "off"
}
EOF

if [ -f "$MARKER" ]; then
  echo "[di-ide] already provisioned ($(cat "$MARKER"))"
else
  echo "[di-ide] installing anthropic.claude-code"
  OK=1
  if ! install_ext anthropic.claude-code; then
    # Gallery-less build (stock code-oss product.json): direct Open VSX fetch.
    echo "[di-ide] gallery install failed — trying direct Open VSX download" >> "$LOG"
    VSIX_URL=$(curl -fsSL https://open-vsx.org/api/Anthropic/claude-code/latest 2>>"$LOG" \
      | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).files.download||"")}catch{}})')
    if [ -n "$VSIX_URL" ] && curl -fsSL -o /tmp/claude-code.vsix "$VSIX_URL" >> "$LOG" 2>&1 \
      && install_ext /tmp/claude-code.vsix; then
      rm -f /tmp/claude-code.vsix
    else
      OK=0
    fi
  fi
  if [ "$OK" = "1" ]; then
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MARKER"
    echo "[di-ide] claude-code extension provisioned"
  else
    echo "[di-ide] claude-code install failed — retries next boot; see $LOG"
  fi
fi

# di-ide is cheap and versioned with the repo — (re)install whenever present,
# so an image rebuild rolls the paradigm layer forward without marker fiddling.
VSIX="${DI_IDE_VSIX:-/opt/di-ide.vsix}"
if [ -f "$VSIX" ]; then
  echo "[di-ide] installing $(basename "$VSIX")"
  install_ext "$VSIX" || echo "[di-ide] di-ide install best-effort failed — see $LOG"
fi
