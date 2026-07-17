import { spawn } from "node:child_process";
import { HttpError } from "./http.js";

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runGit(
  dir: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 120_000,
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: dir, env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new HttpError(504, `git ${args[0]} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function assertOk(r: GitResult, what: string): GitResult {
  if (r.code !== 0) {
    throw new HttpError(422, `${what} failed: ${(r.stderr || r.stdout).trim()}`);
  }
  return r;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  entries: Array<{ status: string; path: string }>;
}

/** Parse `git status --porcelain=v2 --branch`. */
export function parseStatus(raw: string): GitStatus {
  const status: GitStatus = { branch: "", ahead: 0, behind: 0, entries: [] };
  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      status.branch = line.slice("# branch.head ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const fields = line.split(" ");
      // Format: "1 XY sub mH mI mW hH hI path" — path is everything from field 8.
      const xy = fields[1];
      const p = fields.slice(8).join(" ");
      // Renames ("2 ...") carry "new\told" via a tab separator.
      status.entries.push({ status: xy.replace(/\./g, " ").trim(), path: p.split("\t")[0] });
    } else if (line.startsWith("? ")) {
      status.entries.push({ status: "??", path: line.slice(2) });
    }
  }
  return status;
}
