#!/usr/bin/env bash
# Development Intelligence fork build: clone the pinned upstream tag, apply patches, overlay
# product.json, bake the Development Intelligence extension in as a built-in, run the upstream
# build. Heavy (8 GB RAM, 20-40 min) — intended for CI (see ci-build.yml).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${DI_BUILD_DIR:-$HERE/.build}"
TAG="$(node -p "require('$HERE/upstream.json').tag")"
REPO="$(node -p "require('$HERE/upstream.json').repo")"
CHECK_ONLY="${1:-}"

echo "==> upstream $REPO @ $TAG"
mkdir -p "$WORK"
if [ ! -d "$WORK/vscode" ]; then
  git clone --depth 1 --branch "$TAG" "$REPO" "$WORK/vscode"
fi

cd "$WORK/vscode"
git checkout -- . # clean slate on re-runs

echo "==> applying patches"
for p in "$HERE"/patches/*.patch; do
  echo "   - $(basename "$p")"
  # 3-way so small upstream drift auto-resolves; failures mean the patch
  # needs re-anchoring against the new tag.
  git apply --3way "$p" || { echo "PATCH FAILED: $p — re-anchor it against $TAG"; exit 1; }
done

echo "==> overlaying product.json"
node - "$HERE/product.json" << 'EOF'
const fs = require("fs");
const overlay = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const product = JSON.parse(fs.readFileSync("product.json", "utf8"));
fs.writeFileSync("product.json", JSON.stringify({ ...product, ...overlay }, null, "\t"));
EOF

echo "==> baking Development Intelligence extension as a built-in"
(cd "$HERE/../extension" && pnpm install --frozen-lockfile && pnpm build)
mkdir -p extensions/di-ide
cp -r "$HERE/../extension/dist" "$HERE/../extension/media" "$HERE/../extension/package.json" extensions/di-ide/

if [ "$CHECK_ONLY" = "--check" ]; then
  echo "==> --check passed: patches apply, overlay + extension staged"
  exit 0
fi

echo "==> building (this is the long part)"
npm ci
npm run compile
case "${DI_TARGET:-web}" in
  web)    npm run gulp vscode-reh-web-linux-x64-min ;;
  linux)  npm run gulp vscode-linux-x64-min ;;
  darwin) npm run gulp vscode-darwin-arm64-min ;;
  win32)  npm run gulp vscode-win32-x64-min ;;
esac
echo "==> artifacts in $WORK (VS Code writes siblings of the vscode/ checkout)"
