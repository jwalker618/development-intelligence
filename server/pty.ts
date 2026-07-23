import { spawn } from "node:child_process";

export interface PtyHandle {
  readonly backend: "node-pty" | "script";
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number) => void): void;
}

export interface PtyOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
  /** Defaults to a login shell. */
  command?: string;
}

interface NodePtyModule {
  spawn(
    file: string,
    args: string[],
    opts: {
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: NodeJS.ProcessEnv;
    },
  ): {
    write(d: string): void;
    resize(c: number, r: number): void;
    kill(): void;
    onData(cb: (d: string) => void): void;
    onExit(cb: (e: { exitCode: number }) => void): void;
  };
}

let nodePty: NodePtyModule | null | undefined;

async function loadNodePty(): Promise<NodePtyModule | null> {
  if (nodePty !== undefined) return nodePty;
  try {
    nodePty = (await import("node-pty")) as unknown as NodePtyModule;
  } catch {
    nodePty = null; // optional dep missing or native build failed — use fallback
  }
  return nodePty;
}

/**
 * Spawn a real PTY via node-pty when available; otherwise fall back to
 * util-linux `script`, which allocates a pty for us. The fallback cannot
 * resize, but interactive TUIs (claude, vim) still get a terminal.
 */
export async function spawnPty(opts: PtyOptions): Promise<PtyHandle> {
  const shell = process.env.SHELL || "/bin/bash";
  const command = opts.command ?? `${shell} -l`;
  const mod = await loadNodePty();

  if (mod) {
    const [file, ...args] = command.split(" ");
    const p = mod.spawn(file, args, {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: { ...opts.env, TERM: "xterm-256color" },
    });
    return {
      backend: "node-pty",
      write: (d) => p.write(d),
      resize: (c, r) => {
        try {
          p.resize(c, r);
        } catch {
          /* races with exit — ignore */
        }
      },
      kill: () => p.kill(),
      onData: (cb) => p.onData(cb),
      onExit: (cb) => p.onExit((e) => cb(e.exitCode)),
    };
  }

  const child = spawn("script", ["-qfec", command, "/dev/null"], {
    cwd: opts.cwd,
    env: {
      ...opts.env,
      TERM: "xterm-256color",
      COLUMNS: String(opts.cols),
      LINES: String(opts.rows),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const dataCbs: Array<(d: string) => void> = [];
  const emit = (buf: Buffer) => {
    const s = buf.toString("utf8");
    for (const cb of dataCbs) cb(s);
  };
  child.stdout.on("data", emit);
  child.stderr.on("data", emit);
  return {
    backend: "script",
    write: (d) => child.stdin.write(d),
    resize: () => {
      /* not supported without a real pty handle */
    },
    kill: () => child.kill("SIGHUP"),
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => child.on("exit", (code) => cb(code ?? 0)),
  };
}
