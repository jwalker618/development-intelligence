# Development Intelligence fork — building the IDE from VS Code source

Development Intelligence's editor is a **patch-based fork of microsoft/vscode** (the VSCodium /
Cursor model): we pin an upstream tag, keep a small set of patches and a
`product.json` overlay, and CI builds the artifacts. We never maintain a
divergent copy of the VS Code tree — rebasing to a new VS Code release means
bumping `upstream.json` and re-applying a handful of patches.

## What the fork changes (and what it doesn't)

| Layer | Where it lives | Why |
|---|---|---|
| Product identity (name, icons, URLs) | `product.json` overlay | Development Intelligence is its own product, not "code-oss" |
| Review-first defaults | `patches/0001-review-first-defaults.patch` | Trust dialog off, agent panel visible by default, dev-centric chrome tucked away |
| Built-in Development Intelligence extension | build script copies `../extension` into `extensions/` | The paradigm layer ships inside the product, not from a marketplace |
| Everything else (editor, git, terminal, LSP, multi-root workspaces) | **unpatched upstream** | This is the point of forking VS Code instead of rebuilding it |

The paradigm layer itself — agent panel, verbosity dial, review queue,
multi-repo workspace composer — is the `../extension` package. It runs
identically in this fork, in stock VS Code, and in code-server/openvscode
(that's how it's tested in CI without a 40-minute fork build).

## Layout

```
fork/
├── upstream.json       # pinned microsoft/vscode tag the fork builds from
├── product.json        # overlay merged onto upstream's product.json
├── patches/            # numbered git patches applied on top of the tag
│   └── 0001-review-first-defaults.patch
├── build.sh            # clone tag → apply patches → overlay product.json →
│                       #   bake ../extension as a built-in → run upstream build
└── ci-build.yml        # GitHub Actions template: desktop (linux/mac/win) + web
```

## Building

Building VS Code needs ~8 GB RAM and 20–40 min — it runs in CI, not in dev
containers. Locally you iterate on the *extension* against code-server:

```bash
# extension dev loop (fast)
cd ../extension && pnpm build && pnpm package
code-server --install-extension di-ide.vsix

# full fork build (CI, or a beefy machine)
./build.sh          # produces vscode/.build/ artifacts
```

`ci-build.yml` is a workflow template — copy it to `.github/workflows/` in the
fork repository (the fork gets its own repo; it does not build inside this
monorepo).

## Upgrading upstream

1. Bump `tag` in `upstream.json` to the new VS Code release tag.
2. `./build.sh --check` clones and applies patches without building; fix any
   patch that no longer applies (they are deliberately tiny).
3. Let CI build and smoke the artifacts.
