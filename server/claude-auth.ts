import { preseedClaudeConfig, sessionEnv, writeClaudeToken, type GrottoConfig } from "./config.js";
import { spawnPty, type PtyHandle } from "./pty.js";

// ── Guided Claude connect ───────────────────────────────────────────────────
// Runs `claude setup-token` in a HIDDEN server-side PTY so the user never
// touches the TUI: Grotto extracts the authorize URL from the output, takes
// the return code through a normal form field, watches for the minted token,
// and stores it (write-only) for every future session. The PTY is 400 columns
// wide, so the URL is never wrapped, truncated, or garbled by a phone-sized
// terminal — the whole class of copy/paste/scroll problems disappears.

export type AuthState =
  | "idle"
  | "starting"
  | "awaiting-code"
  | "verifying"
  | "done"
  | "error";

export interface AuthStatus {
  state: AuthState;
  /** The claude.ai authorize URL, once the CLI prints it. */
  url: string | null;
  /** Human-readable failure reason (error state only). */
  detail: string | null;
  /** ANSI-stripped tail of the CLI output, tokens scrubbed — for debugging. */
  tail: string;
}

const ANSI_RE =
  /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|[\x00-\x08\x0b-\x1f\x7f]/g;
const TOKEN_RE = /sk-ant-oat[0-9]{2}-[A-Za-z0-9_-]{20,}/;
const URL_RE = /https:\/\/[^\s"'<>]+/;
const FLOW_TIMEOUT_MS = 10 * 60_000;

export class ClaudeAuth {
  private pty: PtyHandle | null = null;
  private buffer = "";
  private state: AuthState = "idle";
  private url: string | null = null;
  private detail: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private cfg: GrottoConfig) {}

  status(): AuthStatus {
    return {
      state: this.state,
      url: this.url,
      detail: this.detail,
      tail: this.buffer.replace(ANSI_RE, "").replace(new RegExp(TOKEN_RE, "g"), "sk-ant-•••").slice(-600),
    };
  }

  async start(): Promise<AuthStatus> {
    this.stop();
    this.buffer = "";
    this.url = null;
    this.detail = null;
    this.state = "starting";

    // A fresh config dir front-loads the onboarding TUI (theme picker) before
    // setup-token's URL — the hidden PTY would hang waiting for input. Seed
    // the first-run state so setup-token goes straight to the OAuth URL.
    preseedClaudeConfig(this.cfg);

    // Mint fresh: a stale/revoked env token must not shadow the new login.
    const env = sessionEnv(this.cfg);
    delete env.CLAUDE_CODE_OAUTH_TOKEN;

    let pty: PtyHandle;
    try {
      pty = await spawnPty({
        cwd: this.cfg.home,
        env,
        cols: 400, // wide → the authorize URL is one unbroken line
        rows: 50,
        command: "claude setup-token",
      });
    } catch (e) {
      this.state = "error";
      this.detail = `could not start claude: ${e instanceof Error ? e.message : String(e)}`;
      return this.status();
    }
    this.pty = pty;

    pty.onData((d) => this.ingest(d));
    pty.onExit((code) => {
      if (this.pty !== pty) return; // superseded by a newer flow
      this.pty = null;
      if (this.state === "done" || this.state === "error") return;
      const wasVerifying = this.state === "verifying";
      this.state = "error";
      this.detail =
        code === 0
          ? "setup-token finished without printing a token — see the output below"
          : this.buffer.replace(ANSI_RE, "").trim() === ""
            ? "claude CLI not found or failed to start"
            : wasVerifying
              ? `setup-token exited (${code}) — the code was likely wrong or expired`
              : `setup-token exited (${code}) before completing`;
    });

    this.timer = setTimeout(() => {
      if (this.state === "awaiting-code" || this.state === "verifying" || this.state === "starting") {
        this.detail = "timed out after 10 minutes — start over";
        this.state = "error";
        this.stopPty();
      }
    }, FLOW_TIMEOUT_MS);

    return this.status();
  }

  submitCode(code: string): AuthStatus {
    if (this.state === "done") return this.status();
    if (!this.pty || (this.state !== "awaiting-code" && this.state !== "verifying")) {
      this.detail = "no login in progress — start over";
      this.state = "error";
      return this.status();
    }
    this.state = "verifying";
    this.pty.write(code.trim() + "\r");
    return this.status();
  }

  cancel(): AuthStatus {
    this.stop();
    this.state = "idle";
    this.url = null;
    this.detail = null;
    this.buffer = "";
    return this.status();
  }

  private ingest(d: string): void {
    this.buffer = (this.buffer + d).slice(-65536);
    const text = this.buffer.replace(ANSI_RE, "");

    if (!this.url) {
      const m = text.match(URL_RE);
      if (m) {
        this.url = m[0].replace(/[),.;:!?'"]+$/, "");
        if (this.state === "starting") this.state = "awaiting-code";
      }
    }

    const token = text.match(TOKEN_RE);
    if (token && this.state !== "done") {
      writeClaudeToken(this.cfg, token[0]);
      this.state = "done";
      // Let the CLI finish its own teardown, then reap it.
      setTimeout(() => this.stopPty(), 1500);
    }
  }

  private stopPty(): void {
    try {
      this.pty?.kill();
    } catch {
      /* already gone */
    }
    this.pty = null;
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.stopPty();
  }
}
