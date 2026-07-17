#!/bin/sh
# Grotto statusline wrapper for Claude Code.
#
# Claude Code invokes the statusline command with session JSON on stdin
# (model.display_name, workspace.current_dir, ...). Grotto session workspaces
# live at $GROTTO_HOME/sessions/<id>, so the cwd basename IS the session id —
# record the active model per session, then delegate to caveman's statusline
# so the terminal badge keeps working. Silent-fails everywhere: a statusline
# must never break the session.

input=$(cat)
dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

model=""
cwd=""
if command -v jq >/dev/null 2>&1; then
  model=$(printf '%s' "$input" | jq -r '.model.display_name // .model.id // empty' 2>/dev/null)
  cwd=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)
elif command -v python3 >/dev/null 2>&1; then
  parsed=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    m = (d.get("model") or {})
    w = (d.get("workspace") or {})
    print((m.get("display_name") or m.get("id") or "").replace("\n", " "))
    print(w.get("current_dir") or d.get("cwd") or "")
except Exception:
    pass' 2>/dev/null)
  model=$(printf '%s' "$parsed" | sed -n 1p)
  cwd=$(printf '%s' "$parsed" | sed -n 2p)
fi

if [ -n "$model" ]; then
  key=$(basename "${cwd:-global}" | tr -cd 'A-Za-z0-9._-')
  [ -n "$key" ] && printf '%s' "$model" > "$dir/.grotto-model.$key" 2>/dev/null
fi

if [ -x "$dir/hooks/caveman-statusline.sh" ]; then
  printf '%s' "$input" | "$dir/hooks/caveman-statusline.sh" 2>/dev/null
fi
exit 0
