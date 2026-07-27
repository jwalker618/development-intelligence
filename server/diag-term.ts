import type { WebSocket } from "ws";
import { claudeTokenKind, sessionEnv, writeClaudeToken, type GrottoConfig } from "./config.js";
import { spawnPty, type PtyHandle } from "./pty.js";

/**
 * Admin terminal for /diag — a real login shell on the control plane, not tied
 * to any repo session. This is the honest way to run `claude setup-token`: the
 * operator drives the actual CLI and reads its actual output, instead of us
 * screen-scraping a hidden PTY and guessing at TUI state.
 *
 * Two conveniences on top of a plain terminal:
 *  - scrollback is retained, so leaving the page (e.g. to authorise in a
 *    browser tab) and coming back shows the session exactly where it was;
 *  - any Anthropic token that appears in the output is captured and stored
 *    automatically — that's the "produce and register the token" step.
 */

const ANSI_RE =
  /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>]|[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g;
const TOKEN_RE = /sk-ant-(?:oat|api)[A-Za-z0-9_-]{20,}/;
const SCROLLBACK = 40_000;
/** ANSI-stripped tail kept for token matching — a token is ~108 chars. */
const CLEAN_TAIL = 8_000;
const HEARTBEAT_MS = 25_000;

export class DiagTerm {
  private pty: PtyHandle | null = null;
  /** In-flight spawn: `pty` is assigned only after an await, so without this
   *  latch two frames in the same tick each spawn a shell and the first becomes
   *  an orphan that keeps writing into the buffer forever. */
  private spawning: Promise<void> | null = null;
  private buffer = "";
  /** Incrementally ANSI-stripped tail; `residue` carries a partial escape
   *  across chunk boundaries so a split sequence can't corrupt the match. */
  private clean = "";
  private residue = "";
  private clients = new Set<WebSocket>();
  private captured: string | null = null;
  private lastCols = 100;
  private lastRows = 30;

  constructor(private cfg: GrottoConfig) {}

  attach(ws: WebSocket): void {
    // Registered FIRST: a protocol-level frame error emits on the socket, and
    // an unhandled 'error' would take the process down.
    ws.on("error", () => {
      this.clients.delete(ws);
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
    });
    this.clients.add(ws);

    const beat = setInterval(() => {
      try {
        ws.ping();
      } catch {
        /* throws synchronously while CONNECTING */
      }
    }, HEARTBEAT_MS);
    ws.on("close", () => {
      this.clients.delete(ws);
      clearInterval(beat);
    });

    ws.send(
      JSON.stringify({
        t: "hello",
        running: !!this.pty,
        backend: this.pty?.backend ?? null,
        data: this.buffer,
        captured: this.captured,
      }),
    );

    ws.on("message", (raw) => {
      let m: { t?: string; data?: string; cols?: number; rows?: number };
      try {
        m = JSON.parse(String(raw)) as typeof m;
      } catch {
        return;
      }
      if (m.t === "attach" || m.t === "start") {
        this.remember(m.cols, m.rows);
        void this.start();
      } else if (m.t === "input" && typeof m.data === "string") {
        // Auto-revive: typing into a dead shell should start one, not vanish.
        if (!this.pty) void this.start().then(() => this.pty?.write(m.data ?? ""));
        else this.pty.write(m.data);
      } else if (m.t === "resize") {
        if (this.remember(m.cols, m.rows)) this.pty?.resize(this.lastCols, this.lastRows);
      } else if (m.t === "kill") {
        this.stop();
      } else if (m.t === "clear") {
        this.buffer = "";
        this.clean = "";
        this.broadcast({ t: "cleared" });
      }
    });
  }

  /** Validate + clamp a requested size; only a sane pair updates the memo. */
  private remember(cols?: number, rows?: number): boolean {
    if (typeof cols !== "number" || typeof rows !== "number") return false;
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return false;
    const c = Math.round(cols);
    const r = Math.round(rows);
    if (c < 20 || r < 5 || c > 500 || r > 200) return false;
    this.lastCols = c;
    this.lastRows = r;
    return true;
  }

  private start(): Promise<void> {
    if (this.pty) return Promise.resolve();
    this.spawning ??= (async () => {
      // No stored credential may shadow a fresh `claude setup-token` mint: a set
      // (even blank) ANTHROPIC_API_KEY outranks the OAuth token.
      const env = sessionEnv(this.cfg);
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;
      try {
        const pty = await spawnPty({
          cwd: this.cfg.home,
          env,
          cols: this.lastCols,
          rows: this.lastRows,
        });
        this.pty = pty;
        pty.onData((d) => this.ingest(d));
        pty.onExit((code) => {
          if (this.pty === pty) this.pty = null;
          this.push(`\r\n[process exited with code ${code}]\r\n`);
          this.broadcast({ t: "exit", code });
        });
        // The `script` fallback ignores resize(); stty is the only thing that
        // actually sizes its pty, via TIOCSWINSZ on its controlling terminal.
        if (pty.backend === "script") pty.write(`stty cols ${this.lastCols} rows ${this.lastRows}\n`);
        this.broadcast({ t: "started", backend: pty.backend });
      } catch (e) {
        this.push(`\r\n[could not start a shell: ${e instanceof Error ? e.message : String(e)}]\r\n`);
      }
    })().finally(() => {
      this.spawning = null;
    });
    return this.spawning;
  }

  private ingest(raw: string): void {
    // Stream RAW bytes: the client is a real xterm.js terminal, so escape codes
    // must survive for the TUI to render.
    this.push(raw);
    if (this.captured) return;
    // Match against an incrementally stripped tail — Ink emits styling mid-line,
    // so the token can be split by SGR sequences in the raw stream.
    const s = this.residue + raw;
    const cut = s.lastIndexOf("\x1b");
    // Keep a trailing partial escape (bounded) for the next chunk.
    const safe = cut >= 0 && s.length - cut < 32 ? s.slice(0, cut) : s;
    this.residue = cut >= 0 && s.length - cut < 32 ? s.slice(cut) : "";
    this.clean = (this.clean + safe.replace(ANSI_RE, "")).slice(-CLEAN_TAIL);
    const m = this.clean.match(TOKEN_RE);
    if (!m) return;
    const token = m[0];
    try {
      writeClaudeToken(this.cfg, token);
      this.captured = `${claudeTokenKind(token)}:${token.slice(0, 14)}…(${token.length} chars)`;
      this.broadcast({ t: "captured", detail: this.captured });
    } catch (e) {
      this.broadcast({ t: "capture_failed", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  private push(text: string): void {
    this.buffer = (this.buffer + text).slice(-SCROLLBACK);
    this.broadcast({ t: "data", data: text });
  }

  private broadcast(frame: Record<string, unknown>): void {
    const s = JSON.stringify(frame);
    for (const ws of this.clients) {
      try {
        ws.send(s);
      } catch {
        /* client went away */
      }
    }
  }

  stop(): void {
    try {
      this.pty?.kill();
    } catch {
      /* already gone */
    }
    this.pty = null;
  }
}
