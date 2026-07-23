// Installs the Grotto statusline wrapper into $CLAUDE_CONFIG_DIR and points
// settings.json at it. The wrapper records the active model per session and
// delegates to caveman's statusline, so the terminal badge is preserved.
// Idempotent; run by the entrypoint on every boot. Never throws out.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  const hooksDir = path.join(configDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "grotto-statusline.sh");
  const dst = path.join(hooksDir, "grotto-statusline.sh");
  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, 0o755);

  const settingsPath = path.join(configDir, "settings.json");
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    /* fresh or unreadable — start clean */
  }
  const current = settings.statusLine?.command ?? "";
  if (!current.endsWith("grotto-statusline.sh")) {
    settings.statusLine = { type: "command", command: dst };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`[grotto] statusline wrapper wired into ${settingsPath}`);
  }
} catch (err) {
  console.log(`[grotto] statusline wiring skipped: ${err?.message ?? err}`);
}
