import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { termUrl } from "../api";

interface Props {
  sessionId: string;
  /** Called once with a function that writes into the PTY. */
  registerSend: (send: (d: string) => void) => void;
  /** Called once with a function that focuses the terminal (opens the mobile
   *  keyboard when invoked from a user gesture). */
  registerFocus?: (focus: () => void) => void;
  /** Called once with a function that collects URLs from the buffer (Links sheet). */
  registerLinkScan?: (scan: () => string[]) => void;
  /** Debounced tail of recent output — drives shell-vs-agent detection. */
  onTail?: (tail: string) => void;
  visible: boolean;
}

/** The terminal surface is always dark — the "cave mouth" — in both themes. */
const THEME = {
  background: "#17130f",
  foreground: "#e7e5e4",
  cursor: "#f97316",
  selectionBackground: "#78716c66",
};

// Characters that can be part of a URL as terminals render them.
const URL_CHAR = /[^\s"'`<>«»()[\]{}]/;

interface FoundLink {
  startRow: number; // 0-based buffer rows
  startCol: number;
  endRow: number;
  endCol: number; // inclusive
  url: string;
}

/**
 * Link detection that survives hard-wrapping: TUIs (Claude Code's login
 * screen) print long URLs as separate buffer rows, wrapped at their own
 * layout width — often a couple of columns short of the terminal edge, and
 * sometimes with a small indent on continuation rows. A row is joined to the
 * next when the URL runs to the end of a near-full row and the next row's
 * leading run looks like URL innards (long, or querystring-flavoured).
 */
function registerHardWrapLinks(term: XTerm): { scan: () => string[] } {
  const lineText = (row: number): string | null =>
    term.buffer.active.getLine(row)?.translateToString(true) ?? null;

  const nearFull = (len: number) => len >= term.cols - 8;

  /** Leading URL-char run of a potential continuation row (after ≤4-space indent). */
  const continuationRun = (text: string): { indent: number; run: string } | null => {
    const indent = (text.match(/^ {0,4}/) ?? [""])[0].length;
    const rest = text.slice(indent);
    let run = "";
    for (const ch of rest) {
      if (!URL_CHAR.test(ch)) break;
      run += ch;
    }
    if (!run) return null;
    // Guard against gluing prose: continuation must look like URL innards.
    if (run.length < 12 && !/[%&=?/]/.test(run)) return null;
    // Never glue a shell prompt (root@host:path# …) — @host:… is URL-legal
    // but it's the most common line to follow output in a terminal.
    if (/^[\w.-]+@[\w.-]+[:#]/.test(run)) return null;
    return { indent, run };
  };

  /** All URLs that START in the given 0-based buffer row. */
  const parseFrom = (startRow: number): FoundLink[] => {
    const text = lineText(startRow);
    if (!text) return [];
    const links: FoundLink[] = [];
    const re = /https?:\/\//g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let url = "";
      let row = startRow;
      let col = m.index;
      let cur: string | null = text;
      let endRow = startRow;
      let endCol = m.index;
      let joined = 0;
      while (cur !== null) {
        let stoppedMidRow = false;
        for (let c = col; c < cur.length; c++) {
          if (!URL_CHAR.test(cur[c])) {
            stoppedMidRow = true;
            break;
          }
          url += cur[c];
          endRow = row;
          endCol = c;
        }
        // Join the next row only when this row's URL ran to the end of a
        // near-full row — i.e. the terminal (or the TUI's layout) cut it.
        if (stoppedMidRow || !nearFull(cur.length) || joined >= 12) break;
        const next = lineText(row + 1);
        const cont = next ? continuationRun(next) : null;
        if (!cont) break;
        row += 1;
        col = cont.indent;
        cur = next;
        joined += 1;
      }
      // Trailing punctuation is prose, not URL (only trim within the end row).
      const trimmed = url.replace(/[),.;:!?'"]+$/, "");
      endCol -= url.length - trimmed.length;
      url = trimmed;
      if (url.length > "https://x".length) {
        links.push({ startRow, startCol: m.index, endRow, endCol, url });
      }
    }
    return links;
  };

  /** Collect distinct URLs from recent buffer rows, newest first (Links sheet). */
  const scan = (): string[] => {
    const buf = term.buffer.active;
    const total = buf.length;
    const from = Math.max(0, total - 600);
    const seen = new Set<string>();
    const urls: string[] = [];
    for (let row = from; row < total; row++) {
      for (const link of parseFrom(row)) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          urls.push(link.url);
        }
      }
    }
    return urls.reverse().slice(0, 20);
  };

  term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      const rowIdx = bufferLineNumber - 1; // xterm is 1-based here
      // URLs may START on this row, or on rows above and span into it.
      const results: FoundLink[] = [];
      for (let back = 0; back <= 10; back++) {
        const start = rowIdx - back;
        if (start < 0) break;
        for (const link of parseFrom(start)) {
          if (link.endRow >= rowIdx && link.startRow <= rowIdx) results.push(link);
        }
        // Stop walking back once the row above can't be a continuation chain.
        const above = lineText(start - 1);
        if (!above || !nearFull(above.length)) break;
      }
      if (results.length === 0) return callback(undefined);
      callback(
        results.map((l) => ({
          range: {
            start: { x: l.startCol + 1, y: l.startRow + 1 },
            end: { x: l.endCol + 1, y: l.endRow + 1 },
          },
          text: l.url,
          decorations: { pointerCursor: true, underline: true },
          activate: (_e: Event, url: string) => window.open(url, "_blank", "noopener"),
        })),
      );
    },
  });

  return { scan };
}

export function TerminalPane({
  sessionId,
  registerSend,
  registerFocus,
  registerLinkScan,
  onTail,
  visible,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const applyFitRef = useRef<() => void>(() => {});
  const onTailRef = useRef(onTail);
  onTailRef.current = onTail;
  // The terminal is taller than the visible host (keyboard open) — show
  // explicit scroll buttons; touch-scroll chaining over xterm is unreliable.
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontSize: 12.5,
      fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
      lineHeight: 1.35,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // URLs in output (claude auth links, PR links, dev-server addresses)
    // become tappable. Custom provider instead of the web-links addon: TUIs
    // like Claude Code hard-print long URLs across rows (not xterm-wrapped),
    // and the addon links only the first row — a truncated, broken URL.
    const linkEngine = registerHardWrapLinks(term);
    registerLinkScan?.(linkEngine.scan);
    term.open(host);
    fitRef.current = fit;
    termRef.current = term;
    registerFocus?.(() => term.focus());

    let ws: WebSocket | null = null;
    let disposed = false;
    let retries = 0;
    let tail = "";
    let tailTimer: ReturnType<typeof setTimeout> | undefined;

    const send = (d: string) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "in", d }));
    };
    registerSend(send);

    const sendResize = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "resize", cols: term.cols, rows: term.rows }));
      }
    };

    // Never hand the PTY fewer than MIN_ROWS: with the mobile keyboard open
    // the host shrinks to a handful of rows and full-screen TUIs (claude's
    // login) truncate their own screen — cutting URLs mid-way and hiding
    // inputs. Below MIN_ROWS the host becomes touch-scrollable over the full
    // terminal instead, and we pin the scroll to the bottom where TUI inputs
    // live.
    const MIN_ROWS = 20;
    const applyFit = () => {
      const dims = fit.proposeDimensions();
      if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
      const cols = Math.max(dims.cols, 20);
      const rows = Math.max(dims.rows, MIN_ROWS);
      const clamped = dims.rows < MIN_ROWS;
      if (term.cols !== cols || term.rows !== rows) term.resize(cols, rows);
      sendResize();
      setOverflowing(clamped);
      if (clamped) {
        // Show the bottom of the TUI (prompts/inputs) after the shrink.
        requestAnimationFrame(() => {
          host.scrollTop = host.scrollHeight;
        });
      }
    };

    const pushTail = (d: string) => {
      tail = (tail + d).slice(-4000);
      clearTimeout(tailTimer);
      tailTimer = setTimeout(() => onTailRef.current?.(tail), 180);
    };

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(termUrl(sessionId));
      ws.onopen = () => {
        retries = 0;
        term.reset(); // server replays scrollback on every connect
        applyFit();
      };
      ws.onmessage = (ev) => {
        let msg: { t: string; d?: string; code?: number };
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.t === "out" && typeof msg.d === "string") {
          term.write(msg.d);
          pushTail(msg.d);
        } else if (msg.t === "exit") {
          term.write(`\r\n[shell exited (${msg.code}) — press any key to restart]\r\n`);
        }
      };
      ws.onclose = () => {
        if (!disposed) {
          retries += 1;
          setTimeout(connect, Math.min(1000 * retries, 5000));
        }
      };
    };
    connect();

    const dataSub = term.onData((d) => {
      if (ws?.readyState === WebSocket.OPEN) send(d);
      else connect(); // "press any key to restart" after exit/disconnect
    });

    applyFitRef.current = applyFit;
    const observer = new ResizeObserver(() => {
      if (host.clientWidth > 0 && host.clientHeight > 0) applyFit();
    });
    observer.observe(host);

    return () => {
      disposed = true;
      clearTimeout(tailTimer);
      dataSub.dispose();
      observer.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, registerSend]);

  useEffect(() => {
    if (visible) applyFitRef.current();
  }, [visible]);

  // xterm doesn't reliably grab focus from touch taps — do it explicitly so
  // tapping the terminal opens the mobile keyboard.
  const focusTerm = () => termRef.current?.focus();

  const scrollBy = (dir: 1 | -1) => {
    const host = hostRef.current;
    if (!host) return;
    host.scrollBy({ top: dir * host.clientHeight * 0.7, behavior: "smooth" });
  };

  return (
    <div className="term-wrap">
      <div className="term-host" ref={hostRef} onClick={focusTerm} onTouchEnd={focusTerm} />
      {overflowing && (
        <div className="term-scroll-btns">
          <button className="term-scroll-btn" onClick={() => scrollBy(-1)} title="Scroll up">
            <ChevronUp size={18} />
          </button>
          <button className="term-scroll-btn" onClick={() => scrollBy(1)} title="Scroll down">
            <ChevronDown size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
