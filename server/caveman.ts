import fs from "node:fs";
import path from "node:path";

export interface CavemanStatus {
  /** Active mode from the flag file, or null when caveman is off/not installed. */
  mode: string | null;
  /** Lifetime savings suffix written by /caveman-stats (e.g. "⛏ 12.4k"). */
  savings: string | null;
}

/**
 * Mirrors caveman's own statusline scripts: read the flag + suffix files from
 * the Claude config dir, whitelist-validate contents, never echo raw bytes.
 */
export function cavemanStatus(claudeConfigDir: string): CavemanStatus {
  return {
    mode: readValidated(path.join(claudeConfigDir, ".caveman-active"), /^[a-z][a-z-]{0,24}$/),
    savings: readValidated(
      path.join(claudeConfigDir, ".caveman-statusline-suffix"),
      /^[\x20-\x7e⛏]{1,40}$/u,
    ),
  };
}

function readValidated(file: string, pattern: RegExp): string | null {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    const value = fs.readFileSync(file, "utf8").trim();
    return pattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

const MODES = new Set([
  "lite",
  "full",
  "ultra",
  "wenyan",
  "wenyan-lite",
  "wenyan-full",
  "wenyan-ultra",
]);

/**
 * The verbosity dial's write side: set or clear the caveman mode flag the
 * hooks read. Mirrors caveman's safeWriteFlag semantics — refuse symlinked
 * targets/parents, atomic temp+rename, 0600.
 */
export function setCavemanMode(claudeConfigDir: string, mode: string | null): void {
  const flag = path.join(claudeConfigDir, ".caveman-active");
  const isSymlink = (p: string): boolean => {
    try {
      return fs.lstatSync(p).isSymbolicLink();
    } catch {
      return false;
    }
  };
  if (isSymlink(flag) || isSymlink(path.dirname(flag))) {
    throw new Error("flag path is a symlink — refusing to write");
  }
  if (mode === null) {
    fs.rmSync(flag, { force: true });
    return;
  }
  if (!MODES.has(mode)) throw new Error(`unknown caveman mode: ${mode}`);
  fs.mkdirSync(path.dirname(flag), { recursive: true });
  const tmp = `${flag}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, mode + "\n", { mode: 0o600 });
  fs.renameSync(tmp, flag);
}
