#!/bin/sh
# Best-effort RTK (rust-token-killer) install with layered fallbacks.
#
# Observed failure modes, each covered:
#  - unpinned: the official script asks the GitHub API for "latest", which
#    403s on rate-limited datacenter IPs (Railway) → try pinned first
#  - pinned: a given release may not publish the asset name the script
#    guesses (v0.9.4 had no ...-musl.tar.gz → real 404) → try direct asset
#    URLs across target triples and recent versions
#  - finally: the unpinned script (API lookup) for when rate limits allow
#
# Exits 0 if rtk ends up runnable, 1 otherwise. Never reads stdin.

set -u
SCRIPT_URL="https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh"

# "Installed" means RUNNABLE — a gnu-linked binary on a glibc that's too old
# (GLIBC_2.39 on bookworm's 2.36) exists but can't execute. Only a working
# --version counts, and a broken binary is removed so retries can replace it.
have() {
  command -v rtk >/dev/null 2>&1 || return 1
  if rtk --version >/dev/null 2>&1; then
    return 0
  fi
  broken=$(command -v rtk)
  echo "[install-rtk] removing non-runnable rtk at $broken"
  rm -f "$broken" 2>/dev/null || true
  return 1
}

try_script() {
  # $1 = version pin ("" = let the script resolve latest via the API)
  curl -fsSL "$SCRIPT_URL" | RTK_VERSION="$1" timeout 180 sh </dev/null >/dev/null 2>&1 || true
}

try_asset() {
  # $1 = version, $2 = target triple
  url="https://github.com/rtk-ai/rtk/releases/download/$1/rtk-$2.tar.gz"
  tmp=$(mktemp -d)
  if curl -fsSL --max-time 120 "$url" -o "$tmp/rtk.tgz" 2>/dev/null \
    && tar -xzf "$tmp/rtk.tgz" -C "$tmp" 2>/dev/null; then
    bin=$(find "$tmp" -maxdepth 3 -name rtk -type f 2>/dev/null | head -1)
    if [ -n "$bin" ] && "$bin" --version >/dev/null 2>&1; then
      install -m 755 "$bin" /usr/local/bin/rtk 2>/dev/null \
        || { mkdir -p "$HOME/.local/bin" && install -m 755 "$bin" "$HOME/.local/bin/rtk"; }
    fi
  fi
  rm -rf "$tmp"
  have
}

have && exit 0

PIN="${RTK_VERSION:-v0.43.0}"
echo "[install-rtk] trying official script pinned to $PIN"
try_script "$PIN"
have && { echo "[install-rtk] ok (pinned script)"; exit 0; }

# musl first: statically linked, runs on any glibc. gnu builds can require a
# newer glibc than the image ships (v0.9.x gnu wants GLIBC_2.39; bookworm has
# 2.36) — only accepted if they actually execute (have() verifies).
for v in "$PIN" v0.42.4 v0.42.3 v0.42.2; do
  for t in x86_64-unknown-linux-musl x86_64-unknown-linux-gnu; do
    echo "[install-rtk] trying release asset $v / $t"
    if try_asset "$v" "$t"; then
      echo "[install-rtk] ok ($v $t)"
      exit 0
    fi
  done
done

echo "[install-rtk] trying official script unpinned (GitHub API lookup)"
try_script ""
have && { echo "[install-rtk] ok (unpinned script)"; exit 0; }

echo "[install-rtk] all strategies failed — rtk not installed"
exit 1
