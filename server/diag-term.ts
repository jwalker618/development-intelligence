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

export class DiagTerm {
  private pty: PtyHandle | null = null;
  private buffer = "";
  private clients = new Set<WebSocket>();
  private captured: string | null = null;

  constructor(private cfg: GrottoConfig) {}

  attach(ws: WebSocket): void {
    this.clients.add(ws);
    ws.send(JSON.stringify({ t: "hello", running: !!this.pty, data: this.buffer, captured: this.captured }));
    ws.on("message", (raw) => {
      let m: { t?: string; data?: string; cols?: number; rows?: number };
      try {
        m = JSON.parse(String(raw)) as typeof m;
      } catch {
        return;
      }
      if (m.t === "start") void this.start();
      else if (m.t === "input" && typeof m.data === "string") this.pty?.write(m.data);
      else if (m.t === "resize") this.pty?.resize(m.cols ?? 120, m.rows ?? 30);
      else if (m.t === "kill") this.stop();
      else if (m.t === "clear") { this.buffer = ""; this.broadcast({ t: "cleared" }); }
    });
    ws.on("close", () => this.clients.delete(ws));
  }

  private async start(): Promise<void> {
    if (this.pty) return;
    // No stored credential may shadow a fresh `claude setup-token` mint: a set
    // (even blank) ANTHROPIC_API_KEY outranks the OAuth token.
    const env = sessionEnv(this.cfg);
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    try {
      // Very wide: a 108-char token (or a long OAuth URL) must never be hard-
      // wrapped by the PTY, or the capture regex matches only a fragment. The
      // page renders into a wrapping <pre>, so width costs nothing visually.
      const pty = await spawnPty({ cwd: this.cfg.home, env, cols: 1000, rows: 40 });
      this.pty = pty;
      pty.onData((d) => this.ingest(d));
      pty.onExit((code) => {
        if (this.pty === pty) this.pty = null;
        this.push(`\n[process exited with code ${code}]\n`);
        this.broadcast({ t: "exit", code });
      });
      this.broadcast({ t: "started" });
    } catch (e) {
      this.push(`\n[could not start a shell: ${e instanceof Error ? e.message : String(e)}]\n`);
    }
  }

  private ingest(raw: string): void {
    this.push(raw.replace(ANSI_RE, ""));
    // Auto-capture: setup-token PRINTS the token and does not save it anywhere,
    // so this is what turns "it appeared on screen" into "it is registered".
    if (this.captured) return;
    const m = this.buffer.match(TOKEN_RE);
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
