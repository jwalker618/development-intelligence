import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, chatUrl, type ChatEvent } from "../api";

/**
 * Native agent chat — the primary way to work with Claude Code on a phone.
 * The server drives Claude Code headlessly (Agent SDK) and streams structured
 * events; this renders them as bubbles, tool cards, and real approval
 * buttons. No TUI, no login screens, no terminal gymnastics. Caveman + RTK
 * run agent-side, so replies arrive already compressed.
 */

interface Props {
  sessionId: string;
  visible: boolean;
  /** No Claude token stored — show the connect call-to-action. */
  needsConnect: boolean;
  onConnect: () => void;
  /** Registers a fn that inserts text into the draft (Files tab @mentions). */
  registerInsert?: (insert: (text: string) => void) => void;
}

export function Chat({ sessionId, visible, needsConnect, onConnect, registerInsert }: Props) {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("");
  const [pending, setPending] = useState<ChatEvent | null>(null);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    registerInsert?.((text) => {
      setDraft((d) => (d ? d.replace(/\s?$/, " ") + text : text));
      inputRef.current?.focus();
    });
  }, [registerInsert]);

  // ── WS: one-way server → client event stream ─────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;
    let retries = 0;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(chatUrl(sessionId));
      ws.onopen = () => {
        retries = 0;
        setConnected(true);
      };
      ws.onmessage = (raw) => {
        let f: { t: string; [k: string]: unknown };
        try {
          f = JSON.parse(raw.data as string);
        } catch {
          return;
        }
        switch (f.t) {
          case "hello":
            setEvents(f.events as ChatEvent[]);
            setBusy(Boolean(f.busy));
            setPending((f.pendingApproval as ChatEvent | null) ?? null);
            setDelta("");
            break;
          case "event": {
            const ev = f.event as ChatEvent;
            setEvents((prev) => [...prev.filter((p) => p.seq !== ev.seq), ev]);
            if (ev.kind === "text" || ev.kind === "result" || ev.kind === "error") setDelta("");
            if (ev.kind === "approval") setPending(ev);
            if (ev.kind === "approval_done") setPending(null);
            break;
          }
          case "delta":
            setDelta((d) => d + String(f.text ?? ""));
            break;
          case "status":
            setBusy(Boolean(f.busy));
            break;
          case "approval_cleared":
            setPending((p) => (p && p.id === f.id ? null : p));
            break;
          default:
            break;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!disposed) {
          retries += 1;
          setTimeout(connect, Math.min(1000 * retries, 5000));
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      ws?.close();
    };
  }, [sessionId]);

  // Pin to bottom while the user hasn't scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [events, delta, busy, pending]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    stickBottom.current = true;
    void api.chatMessage(sessionId, text).catch(() => setDraft(text)); // restore on failure
  }, [draft, sessionId]);

  const decide = (decision: "allow" | "always" | "deny") => {
    if (!pending) return;
    const id = String(pending.id);
    setPending(null);
    void api.chatApproval(sessionId, id, decision).catch(() => undefined);
  };

  // Pair tool_done outputs with their tool events for the cards.
  const outputs = useMemo(() => {
    const m = new Map<string, ChatEvent>();
    for (const e of events) if (e.kind === "tool_done") m.set(String(e.toolUseId), e);
    return m;
  }, [events]);

  return (
    <div className={visible ? "chat-pane" : "chat-pane hidden"}>
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {needsConnect && (
          <div className="chat-connect">
            <KeyRound size={16} />
            <span>
              Connect your Claude subscription once — every session stays signed in after.
            </span>
            <button className="btn primary" onClick={onConnect}>
              Connect Claude
            </button>
          </div>
        )}
        {events.length === 0 && !needsConnect && (
          <p className="chat-empty">
            Ask for anything — the agent works in this repo's checkout. Caveman keeps replies
            short; approvals show up as buttons.
          </p>
        )}
        {events.map((ev) => (
          <ChatRow key={ev.seq} ev={ev} outputs={outputs} />
        ))}
        {delta && (
          <div className="msg assistant">
            {delta}
            <span className="chat-caret" />
          </div>
        )}
        {busy && !delta && (
          <div className="chat-typing">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      {pending && (
        <div className="approve-card">
          <div className="approve-title">{String(pending.title ?? "Approve?")}</div>
          {pending.input != null && (
            <pre className="approve-input">{previewInput(pending.input)}</pre>
          )}
          <div className="btn-row">
            <button className="btn primary" style={{ flex: 1 }} onClick={() => decide("allow")}>
              <Check size={14} /> Allow
            </button>
            <button className="btn outline" onClick={() => decide("always")}>
              Always
            </button>
            <button className="btn danger" onClick={() => decide("deny")}>
              <X size={14} /> Deny
            </button>
          </div>
        </div>
      )}

      <div className="chat-inputbar">
        <textarea
          ref={inputRef}
          rows={1}
          placeholder={connected ? "Message the agent…" : "reconnecting…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 1100px)").matches) {
              e.preventDefault();
              send();
            }
          }}
        />
        {busy ? (
          <button
            className="chat-sendbtn stop"
            title="Stop the agent"
            onClick={() => void api.chatInterrupt(sessionId).catch(() => undefined)}
          >
            <Square size={15} />
          </button>
        ) : (
          <button className="chat-sendbtn" title="Send" disabled={!draft.trim()} onClick={send}>
            <ArrowUp size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

function previewInput(input: unknown): string {
  if (typeof input === "object" && input !== null) {
    const i = input as Record<string, unknown>;
    const key = ["command", "file_path", "path", "url", "pattern"].find(
      (k) => typeof i[k] === "string",
    );
    if (key) return String(i[key]).slice(0, 400);
    return JSON.stringify(input, null, 1).slice(0, 400);
  }
  return String(input).slice(0, 400);
}

function ChatRow({ ev, outputs }: { ev: ChatEvent; outputs: Map<string, ChatEvent> }) {
  switch (ev.kind) {
    case "user":
      return <div className="msg user">{String(ev.text)}</div>;
    case "text":
      return <div className="msg assistant">{String(ev.text)}</div>;
    case "tool":
      return <ToolCard ev={ev} done={outputs.get(String(ev.toolUseId)) ?? null} />;
    case "result":
      return (
        <div className="chat-result">
          {ev.ok ? "✓" : "✗"} {Math.round(Number(ev.durationMs) / 100) / 10}s
          {typeof ev.costUsd === "number" ? ` · $${ev.costUsd.toFixed(2)}` : ""}
        </div>
      );
    case "error":
      return <div className="error">{String(ev.message)}</div>;
    default:
      return null; // init, approval (rendered as pinned card), tool_done (inside ToolCard)
  }
}

function ToolCard({ ev, done }: { ev: ChatEvent; done: ChatEvent | null }) {
  const [open, setOpen] = useState(false);
  const failed = done != null && done.ok === false;
  return (
    <div className={failed ? "tool-card failed" : "tool-card"}>
      <button className="tool-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Wrench size={12} />
        <span className="tool-name">{String(ev.name)}</span>
        {ev.summary ? <span className="tool-summary">{String(ev.summary)}</span> : null}
        <span className={done ? (failed ? "dot needs" : "dot done") : "dot live"} />
      </button>
      {open && (
        <div className="tool-detail">
          <div className="eyebrow">input</div>
          <pre>{String(ev.input)}</pre>
          {done && (
            <>
              <div className="eyebrow">output</div>
              <pre>{String(done.output) || "(empty)"}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
