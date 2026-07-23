# Development Intelligence — session environment + control plane, single-user.
#
# The container IS the vibe-coding environment: git, Claude Code, caveman and
# RTK are baked in, so every session inherits the full token-economy stack.
# The clients (phone PWA, the DI IDE) are viewports onto it.
#
# Build (from the repo root):
#   docker build -t development-intelligence .
# Run (persistent volume at /data keeps Claude subscription login, caveman
# state, and session workspaces across redeploys):
#   docker run -p 4870:4870 \
#     -e GROTTO_TOKEN=<pick-a-long-secret> \
#     -e GROTTO_GIT_TOKEN=<github-pat> \
#     -e GROTTO_REPOS=you/repo-a,you/repo-b \
#     -e CLAUDE_CONFIG_DIR=/data/claude-config \
#     -e GROTTO_HOME=/data/grotto \
#     -v di-data:/data \
#     development-intelligence
# Claude auth: either set ANTHROPIC_API_KEY, or log in once with your Claude
# subscription once from the app — credentials persist in the volume.

FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 make g++ util-linux ripgrep jq \
  && rm -rf /var/lib/apt/lists/*

# Pin pnpm — unpinned "latest" drifted into a version that treats un-approved
# dependency build scripts (node-pty, esbuild) as a fatal install error. The
# build scripts are approved via pnpm.onlyBuiltDependencies in package.json.
RUN npm install -g pnpm@10.33.0 @anthropic-ai/claude-code

# Gemini CLI for multi-model routing from the same PTY (best-effort — grotto
# works without it). Installed before caveman so its installer detects it.
RUN npm install -g @google/gemini-cli || echo "gemini-cli optional — skipped"

# caveman + RTK: the whole point. Installed separately — upstream caveman
# dropped its --with-rtk passthrough, so RTK comes straight from its own
# installer. RTK_VERSION pins the release so no GitHub API call is made
# (unauthenticated API calls 403 on rate-limited datacenter IPs, Railway
# builders included). The caveman clone stays at /opt/caveman so the
# entrypoint can re-provision a volume-backed CLAUDE_CONFIG_DIR at runtime.
ENV RTK_VERSION=v0.43.0
# RTK's installer drops the binary in ~/.local/bin — put it on PATH for the
# server process and non-login shells, not just `bash -l` sessions.
ENV PATH="/root/.local/bin:${PATH}"
# Layered-fallback installer (pinned script → direct assets across target
# triples/versions → unpinned script). Shared with the entrypoint and Repair.
COPY scripts/install-rtk.sh /usr/local/bin/install-rtk
RUN chmod +x /usr/local/bin/install-rtk \
  && (install-rtk && rtk init -g </dev/null \
      || echo "RTK best-effort — Diagnostics → Repair retries at runtime")
# Clone the jwalker618 fork — that's where this stack's caveman changes live
# (e.g. /caveman-prune) and whose installer flags this stack is coded against.
# Installer flags can still drift — try the full set, fall back.
RUN git clone --depth 1 https://github.com/jwalker618/caveman /opt/caveman \
  && (node /opt/caveman/bin/install.js --with-hooks --only claude --non-interactive </dev/null \
      || node /opt/caveman/bin/install.js --non-interactive </dev/null \
      || echo "caveman install best-effort — the entrypoint retries at runtime")

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
RUN pnpm install
RUN pnpm build

ENV PORT=4870
EXPOSE 4870
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
