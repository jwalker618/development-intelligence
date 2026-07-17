import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GrottoConfig } from "./config.js";
import { HttpError } from "./http.js";

/** Environment health checks — turns "caveman isn't working" into data. */

export interface DoctorCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

function run(
  cmd: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    // stdin ignored: interactive prompts (e.g. gemini's workspace-trust ask)
    // get EOF instead of hanging Repair until the timeout.
    const child = spawn(cmd, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout?.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, out: `${cmd}: not found` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
  });
}

export async function doctor(cfg: GrottoConfig): Promise<DoctorCheck[]> {
  const dir = cfg.claudeConfigDir;
  const checks: DoctorCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) =>
    checks.push({ id, label, ok, detail });

  // Which build is actually running — ends "did the fix deploy?" guesswork.
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  add(
    "build",
    "Deployed build",
    true,
    sha
      ? `${sha.slice(0, 9)}${process.env.RAILWAY_GIT_BRANCH ? ` · ${process.env.RAILWAY_GIT_BRANCH}` : ""}`
      : "no RAILWAY_GIT_COMMIT_SHA (local run?)",
  );

  add("configDir", "Claude config dir", fs.existsSync(dir), dir);

  const claude = await run("claude", ["--version"]);
  add("claude", "Claude Code CLI", claude.code === 0, claude.out.trim().slice(0, 60));

  const rtk = await run("rtk", ["--version"]);
  if (rtk.code === 0) {
    add("rtk", "RTK (tool-output compressor)", true, rtk.out.trim().slice(0, 60));
  } else {
    // The binary may exist but be off this process's PATH.
    const stray = ["/root/.local/bin/rtk", "/usr/local/bin/rtk"].find((p) =>
      fs.existsSync(p),
    );
    add(
      "rtk",
      "RTK (tool-output compressor)",
      false,
      stray ? `installed at ${stray} but not on the server PATH` : "rtk: not found",
    );
  }

  add(
    "cavemanClone",
    "Caveman source (/opt/caveman)",
    fs.existsSync("/opt/caveman/bin/install.js"),
    "needed for provisioning/repair",
  );

  let settings: Record<string, unknown> | null = null;
  try {
    settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  } catch {
    /* missing or invalid */
  }
  add(
    "settings",
    "settings.json parses",
    settings !== null,
    settings === null ? "missing or invalid JSON" : "ok",
  );

  const hooks = (settings?.hooks ?? {}) as Record<string, unknown>;
  add(
    "hooksWired",
    "Caveman hooks wired (SessionStart)",
    "SessionStart" in hooks,
    "SessionStart" in hooks ? "present in settings.json" : "not in settings.json — run Repair",
  );
  add(
    "hookFiles",
    "Hook files installed",
    fs.existsSync(path.join(dir, "hooks", "caveman-activate.js")),
    path.join(dir, "hooks"),
  );

  const statusline = (settings?.statusLine as { command?: string } | undefined)?.command ?? "";
  add(
    "statusline",
    "Model-reporting statusline",
    statusline.endsWith("grotto-statusline.sh"),
    statusline || "not configured — run Repair",
  );

  const provisioned = fs.existsSync(path.join(dir, ".grotto-provisioned"));
  add("provisioned", "Provisioning marker", provisioned, ".grotto-provisioned");

  // When provisioning hasn't landed, surface WHY from the boot log.
  if (!provisioned) {
    try {
      const log = fs.readFileSync(path.join(dir, ".grotto-provision.log"), "utf8");
      const tail = log.trim().split("\n").slice(-6).join(" · ").slice(0, 300);
      add("provisionLog", "Last boot provisioning output", false, tail || "(empty log)");
    } catch {
      add(
        "provisionLog",
        "Last boot provisioning output",
        false,
        "no log — the entrypoint never attempted provisioning (older image?)",
      );
    }
  }

  add(
    "flag",
    "Caveman activated in a session yet",
    fs.existsSync(path.join(dir, ".caveman-active")),
    "written by the SessionStart hook when claude starts — start claude once if missing",
  );

  return checks;
}

/** Re-run provisioning (installer + RTK + statusline wiring), with output. */
export async function repair(cfg: GrottoConfig): Promise<string> {
  if (!fs.existsSync("/opt/caveman/bin/install.js")) {
    throw new HttpError(500, "no /opt/caveman in this image — redeploy from the current Dockerfile");
  }

  // Upstream caveman's installer flags drift — probe --help, pass what exists.
  // Note: --with-rtk deliberately NOT passed even when supported — Grotto owns
  // RTK via install-rtk (runnability-checked, musl-first); the installer's own
  // RTK step is existence-checked and noisily re-fails on a broken binary.
  const help = await run("node", ["/opt/caveman/bin/install.js", "--help"], 30_000);
  const args = ["/opt/caveman/bin/install.js"];
  if (help.out.includes("--with-hooks")) args.push("--with-hooks");
  // Only wire Claude Code — the gemini/codex installers prompt interactively.
  if (help.out.includes("--only")) args.push("--only", "claude");
  args.push("--non-interactive");
  let output = `$ node ${args.join(" ")}\n`;
  const install = await run("node", args, 240_000);
  output += install.out;

  // RTK independently (upstream caveman no longer installs it). Prefer the
  // layered-fallback installer baked into the image.
  const hasRtk = (await run("rtk", ["--version"], 10_000)).code === 0;
  if (!hasRtk) {
    output += "\n$ install-rtk\n";
    const rtkInstall = fs.existsSync("/usr/local/bin/install-rtk")
      ? await run("install-rtk", [], 600_000)
      : await run(
          "sh",
          ["-c", "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh"],
          180_000,
        );
    output += rtkInstall.out;
  }
  if ((await run("rtk", ["--version"], 10_000)).code === 0) {
    const init = await run("rtk", ["init", "-g"], 30_000);
    output += "\n$ rtk init -g\n" + init.out;
  }

  const wire = path.resolve(import.meta.dirname, "../scripts/wire-statusline.mjs");
  if (fs.existsSync(wire)) {
    const wired = await run("node", [wire], 30_000);
    output += "\n" + wired.out;
  }
  if (install.code === 0) {
    try {
      fs.writeFileSync(
        path.join(cfg.claudeConfigDir, ".grotto-provisioned"),
        new Date().toISOString() + " (repair)\n",
      );
    } catch {
      /* marker is best-effort */
    }
  }
  return output.trim();
}
