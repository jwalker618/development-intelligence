import { useRef, useState } from "react";
import { Icon, RailTitle } from "../primitives";
import { RailScroll, RailDock, MainColumn } from "../Shell";
import type { ChatState } from "../control";
import type { SAMPLE } from "../control";
import type { CavemanMode, SessionState } from "../state";

const MODES: CavemanMode[] = ["off", "lite", "full", "ultra"];
const BAR_H = [22, 46, 70, 100];
const BAR_TINT = ["#2b4056", "#5a4326", "#8a5a24", "#a8641f"];

export function SessionScreen({
  s, chat, cavemanSavings, sample, onCaveman, onSend, onApproval, onInterrupt,
}: {
  s: SessionState;
  chat: ChatState;
  cavemanSavings: string | null;
  sample: typeof SAMPLE;
  onCaveman: (m: CavemanMode) => void;
  onSend: (text: string) => void;
  onApproval: (id: string, d: "allow" | "always" | "deny") => void;
  onInterrupt: () => void;
}) {
  const [pins, setPins] = useState(s.pins);
  return (
    <>
      {/* ── rail ── */}
      <RailScroll bottom={64}>
        <RailTitle style={{ padding: "2px 2px 11px" }}>Session</RailTitle>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <KpiTile eyebrow="Caveman" value={cavemanSavings ?? (sample.cavemanPercent ? `${s.caveman.savedPct}%` : "—")}
            unit={cavemanSavings ? "saved" : "context saved"} sampleTag={!cavemanSavings && sample.cavemanPercent}
            valueColor="var(--di-info)" border="#23415f" bg="#0f2842" eyebrowColor="var(--di-ink-mute)" />
          <KpiTile eyebrow="RTK" value={`+${s.rtk.gainPct}%`} unit="tokens returned" sampleTag={sample.rtk}
            valueColor="var(--di-pos)" border="#2a3f2e" bg="#10241a" eyebrowColor="#8fb89a" />
        </div>

        {/* caveman verbosity — writes the real flag via /api/caveman */}
        <div style={{ marginBottom: 16, border: "1px solid #23415f", borderRadius: 11, background: "linear-gradient(180deg,#0f2842,#0b1f34)", padding: "8px 11px 7px" }}>
          <div className="di-eyebrow" style={{ marginBottom: 7 }}>Caveman verbosity</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 38, borderBottom: "1.5px solid var(--di-rule)" }}>
            {MODES.map((m, i) => {
              const active = s.caveman.mode === m;
              return (
                <button key={m} className="di-seg di-btn" onClick={() => onCaveman(m)} aria-label={`Caveman ${m}`} aria-pressed={active}
                  style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 4px", cursor: "pointer", border: 0, background: "transparent" }}>
                  <span className="di-bar" style={{ width: "100%", height: `${BAR_H[i]}%`, borderRadius: "3px 3px 0 0",
                    background: active ? "linear-gradient(180deg,#ffb98a,#f0926e)" : BAR_TINT[i],
                    boxShadow: active ? "0 0 12px rgba(240,146,110,.5)" : "none" }} />
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 5 }}>
            {MODES.map((m) => (
              <span key={m} style={{ flex: 1, textAlign: "center", fontSize: 8.5, color: s.caveman.mode === m ? "var(--di-spot)" : "#6f8296", fontWeight: s.caveman.mode === m ? 600 : 400 }}>{m}</span>
            ))}
          </div>
        </div>

        <div className="di-eyebrow" style={{ marginBottom: 12 }}>Timeline</div>
        <div style={{ position: "relative", paddingLeft: 20, marginBottom: 20 }}>
          <div style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 2, background: "var(--di-rule)" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
            {s.timeline.map((t, i) => <TimelineRow key={i} t={t} />)}
          </div>
        </div>

        <div className="di-eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          Pinned · {pins.length}{sample.pins && <SampleChip />}
        </div>
        {pins.map((p) => (
          <div key={p.id} className="di-btn" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", border: "1px solid #6a4a1a", borderRadius: 10, background: "#1a1206", marginBottom: 7 }}>
            <Icon name={p.icon} size={13} color="var(--di-warn)" />
            <span style={{ fontSize: 11.5, color: "#e9dcc8", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>
            <button className="di-btn" onClick={() => setPins((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Unpin ${p.label}`} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
              <Icon name="x" size={12} color="var(--di-ink-mute)" />
            </button>
          </div>
        ))}
      </RailScroll>

      <RailDock style={{ background: "var(--di-panel-alt)", borderTop: "1px solid #16273a" }}>
        <div className="di-row di-btn" style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", border: "1px solid var(--di-rule)", borderRadius: 10, background: "var(--di-surface-sunken)", cursor: "pointer" }}>
          <Icon name="search" size={15} color="var(--di-ink-mute)" />
          <span style={{ fontSize: 12, color: "#6f8296", flex: 1 }}>Search this session…</span>
          <span className="di-mono" style={{ fontSize: 10, color: "#6f8296" }}>⌘K</span>
        </div>
      </RailDock>

      {/* ── main: the agent conversation (live) ── */}
      <MainColumn style={{ background: "var(--cc-bg)" }}>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "14px 20px", borderBottom: "1px solid var(--cc-rule)" }}>
          <Icon name="asterisk" size={16} color="#c9d2dc" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--cc-ink)" }}>Claude Code</span>
          <span style={{ fontSize: 10.5, color: "var(--cc-ink-mute)" }}>Anthropic{chat.model ? ` · ${chat.model}` : ""}</span>
          <span style={{ flex: 1 }} />
          {chat.busy ? (
            <button className="di-btn" onClick={onInterrupt} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 999, background: "#132018", border: "1px solid #23402e", fontSize: 10.5, color: "#5fbf7f", cursor: "pointer" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#5fbf7f", animation: "di-pulse 1.4s infinite" }} />working · stop
            </button>
          ) : (
            <span style={{ fontSize: 10.5, color: "var(--cc-ink-mute)" }}>idle</span>
          )}
        </div>

        <ChatBody chat={chat} onApproval={onApproval} />

        <Composer onSend={onSend} />
      </MainColumn>
    </>
  );
}

function ChatBody({ chat, onApproval }: { chat: ChatState; onApproval: (id: string, d: "allow" | "always" | "deny") => void }) {
  if (chat.messages.length === 0) {
    return (
      <div className="di-scroll" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cc-ink-mute)", fontSize: 12.5 }}>
        Message Claude Code to start the conversation.
      </div>
    );
  }
  return (
    <div className="di-scroll" style={{ flex: 1, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 13 }}>
      {chat.messages.map((m) => {
        if (m.role === "user") return (
          <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "70%", background: "#1c2836", border: "1px solid #2a3a49", borderRadius: "12px 12px 4px 12px", padding: "10px 13px", fontSize: 12.5, lineHeight: 1.5, color: "#dbe3ec", whiteSpace: "pre-wrap" }}>{m.text}</div>
        );
        if (m.role === "agent") return (
          <div key={m.id} style={{ maxWidth: "86%", fontSize: 12.5, lineHeight: 1.6, color: "#aeb9c5", whiteSpace: "pre-wrap" }}>{m.text}</div>
        );
        if (m.role === "tool") return (
          <div key={m.id} style={{ width: "100%", maxWidth: 520, border: "1px solid var(--cc-rule)", borderRadius: 9, background: "#0f1720" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px" }}>
              <Icon name="file-pen" size={13} color="#7f8c9a" />
              <span className="di-mono" style={{ fontSize: 11, color: "#c9d2dc" }}>{m.text}{m.file ? ` · ${m.file}` : ""}</span>
            </div>
          </div>
        );
        // approval — the native Allow/Always/Deny card
        const pending = chat.pendingApprovalId === m.approvalId;
        return (
          <div key={m.id} style={{ alignSelf: "flex-start", border: "1px solid #3a2f18", borderRadius: 9, background: "#181206", padding: "10px 12px", maxWidth: "86%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: pending ? 9 : 0 }}>
              <Icon name="terminal" size={13} color="#c99a4a" />
              <span style={{ fontSize: 11.5, color: "#d9c9a6" }}>{m.text}</span>
            </div>
            {pending && (
              <div style={{ display: "flex", gap: 7 }}>
                {(["allow", "always", "deny"] as const).map((d) => (
                  <button key={d} className="di-btn" onClick={() => onApproval(m.approvalId!, d)}
                    style={{ height: 28, padding: "0 12px", borderRadius: 7, border: d === "deny" ? "1px solid #4a2020" : 0, cursor: "pointer",
                      background: d === "deny" ? "transparent" : d === "always" ? "#1f8a5b" : "#2a6a44", color: d === "deny" ? "var(--di-neg)" : "#eafff1", fontSize: 11, fontWeight: 600, fontFamily: "inherit", textTransform: "capitalize" }}>{d}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Composer({ onSend }: { onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = () => { const t = text.trim(); if (!t) return; onSend(t); setText(""); if (ref.current) ref.current.style.height = "auto"; };
  return (
    <div style={{ flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid var(--cc-rule)" }}>
      <div style={{ border: "1px solid #33414f", borderRadius: 12, background: "#0f1720", padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
        <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Message Claude Code…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, fontSize: 12.5, color: "var(--cc-ink)", background: "transparent", border: 0, outline: "none", resize: "none", fontFamily: "inherit", maxHeight: 120 }} />
        <Icon name="at-sign" size={15} color="#586573" />
        <button className="di-btn" onClick={send} aria-label="Send" style={{ width: 28, height: 28, borderRadius: 8, background: text.trim() ? "var(--di-spot)" : "#3a4653", display: "flex", alignItems: "center", justifyContent: "center", border: 0, cursor: "pointer" }}>
          <Icon name="arrow-up" size={15} color={text.trim() ? "#3a140a" : "#c9d2dc"} />
        </button>
      </div>
    </div>
  );
}

export function SampleChip() {
  return <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#6f8296", border: "1px solid #33445a", borderRadius: 999, padding: "1px 6px" }}>sample</span>;
}

function KpiTile({ eyebrow, value, unit, valueColor, border, bg, eyebrowColor, sampleTag }: {
  eyebrow: string; value: string; unit: string; valueColor: string; border: string; bg: string; eyebrowColor: string; sampleTag?: boolean;
}) {
  return (
    <div style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 11, background: bg, padding: "9px 11px", position: "relative" }}>
      <div className="di-eyebrow" style={{ color: eyebrowColor, marginBottom: 4, fontSize: 9, display: "flex", alignItems: "center", gap: 5 }}>
        {eyebrow}{sampleTag && <SampleChip />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span className="di-mono" style={{ fontSize: 19, fontWeight: 600, color: valueColor, letterSpacing: "-0.01em" }}>{value}</span>
        <span style={{ fontSize: 9, color: "#6f8296" }}>{unit}</span>
      </div>
    </div>
  );
}

function TimelineRow({ t }: { t: SessionState["timeline"][number] }) {
  const dot = {
    now: <span style={{ position: "absolute", left: -20, width: 10, height: 10, borderRadius: 999, background: "#0a1622", border: "2px solid var(--di-pos)" }} />,
    pinned: <span style={{ position: "absolute", left: -20, width: 9, height: 9, borderRadius: 2, background: "var(--di-warn)" }} />,
    approved: <span style={{ position: "absolute", left: -19, width: 8, height: 8, borderRadius: 999, background: "var(--di-spot)" }} />,
    merged: <span style={{ position: "absolute", left: -19, width: 8, height: 8, borderRadius: 999, background: "var(--di-info)" }} />,
  }[t.kind];
  const color = t.kind === "now" ? "var(--di-ink)" : t.kind === "pinned" ? "#e9dcc8" : "var(--di-ink-soft)";
  return (
    <div className="di-btn di-tick" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      {dot}
      <span className="di-ticklabel" style={{ fontSize: 12, color, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
      <span className="di-mono" style={{ fontSize: 10, color: "var(--di-ink-mute)" }}>{t.at}</span>
    </div>
  );
}
