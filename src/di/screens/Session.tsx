import { useEffect, useRef, useState } from "react";
import { Icon, RailTitle } from "../primitives";
import { RailScroll, RailDock, MainColumn } from "../Shell";
import type { ChatMsg, ChatState } from "../control";
import type { SAMPLE } from "../control";
import type { ModelRow, SearchHit, UsageSummary } from "../../api";
import type { CavemanMode, SessionState } from "../state";

const MODES: CavemanMode[] = ["off", "lite", "full", "ultra"];
const BAR_H = [22, 46, 70, 100];
const BAR_TINT = ["#2b4056", "#5a4326", "#8a5a24", "#a8641f"];

/** Display copy for an effort level; the AVAILABLE levels come per-model from
 *  the SDK catalog (ModelInfo.supportedEffortLevels), never from a hardcode. */
const EFFORT_META: Record<string, { label: string; sub: string }> = {
  low: { label: "Low", sub: "Minimal thinking · fastest" },
  medium: { label: "Medium", sub: "Moderate thinking" },
  high: { label: "High", sub: "Deep reasoning · default" },
  xhigh: { label: "X-High", sub: "Deeper than high" },
  max: { label: "Max", sub: "Maximum effort" },
};

/** The catalog row for the current session: the user's explicit pick if any,
 *  else the row matching what the CLI actually resolved (Default sessions). */
function activeRow(rows: ModelRow[] | null, model: string | null, active: string | null): ModelRow | null {
  if (!rows?.length) return null;
  if (model) return rows.find((r) => r.value === model || r.resolvedModel === model) ?? null;
  if (active) return rows.find((r) => r.resolvedModel === active || r.value === active) ?? null;
  return null;
}

export function SessionScreen({
  s, chat, cavemanSavings, sample, claudeConnected, onConnect, onCaveman, onSend, onApproval, onInterrupt, models, usage, onModel, onEffort, onRefreshModels, onAddPin, onRemovePin, onSearch,
}: {
  s: SessionState;
  chat: ChatState;
  cavemanSavings: string | null;
  sample: typeof SAMPLE;
  claudeConnected: boolean | null;
  onConnect: () => void;
  onCaveman: (m: CavemanMode) => void;
  onSend: (text: string) => void;
  onApproval: (id: string, d: "allow" | "always" | "deny" | "stop", input?: Record<string, unknown>) => void;
  onInterrupt: () => void;
  models: ModelRow[] | null;
  usage: UsageSummary | null;
  onModel: (m: string) => void;
  onEffort: (e: string | null) => void;
  onRefreshModels: () => void;
  onAddPin: (icon: string, label: string) => void;
  onRemovePin: (id: string) => void;
  onSearch: (q: string) => Promise<SearchHit[]>;
}) {
  const pins = s.pins;
  const [modelMenu, setModelMenu] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [addingPin, setAddingPin] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl-K opens transcript search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {/* ── rail ── */}
      <RailScroll bottom={64}>
        <RailTitle style={{ padding: "2px 2px 11px" }}>Session</RailTitle>

        <EfficiencyPanel usage={usage} cavemanSavings={cavemanSavings} />

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
          <button className="di-btn" onClick={() => setAddingPin((v) => !v)} aria-label="Add pin" title="Add pin"
            style={{ marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
            <Icon name={addingPin ? "x" : "plus"} size={13} color="var(--di-ink-mute)" />
          </button>
        </div>
        {addingPin && (
          <form
            onSubmit={(e) => { e.preventDefault(); const v = pinDraft.trim(); if (v) { onAddPin("pin", v); setPinDraft(""); setAddingPin(false); } }}
            style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input autoFocus value={pinDraft} onChange={(e) => setPinDraft(e.target.value)} placeholder="Keep in context…"
              style={{ flex: 1, minWidth: 0, height: 32, padding: "0 10px", border: "1px solid #6a4a1a", borderRadius: 9, background: "#1a1206", color: "#e9dcc8", fontFamily: "inherit", fontSize: 11.5, outline: "none" }} />
            <button className="di-btn" type="submit" aria-label="Save pin"
              style={{ flex: "0 0 auto", width: 32, height: 32, border: 0, borderRadius: 9, background: "var(--di-warn)", color: "#1a1206", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={14} color="#1a1206" />
            </button>
          </form>
        )}
        {pins.length === 0 && !addingPin && (
          <div style={{ fontSize: 11, color: "#6f8296", padding: "2px 2px 4px", lineHeight: 1.5 }}>Nothing pinned. Pin a decision or command to keep it in context.</div>
        )}
        {pins.map((p) => (
          <div key={p.id} className="di-btn" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", border: "1px solid #6a4a1a", borderRadius: 10, background: "#1a1206", marginBottom: 7 }}>
            <Icon name={p.icon} size={13} color="var(--di-warn)" />
            <span style={{ fontSize: 11.5, color: "#e9dcc8", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>
            <button className="di-btn" onClick={() => onRemovePin(p.id)} aria-label={`Unpin ${p.label}`} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
              <Icon name="x" size={12} color="var(--di-ink-mute)" />
            </button>
          </div>
        ))}
      </RailScroll>

      <RailDock style={{ background: "var(--di-panel-alt)", borderTop: "1px solid #16273a" }}>
        <button className="di-row di-btn" onClick={() => setSearchOpen(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", border: "1px solid var(--di-rule)", borderRadius: 10, background: "var(--di-surface-sunken)", cursor: "pointer", fontFamily: "inherit" }}>
          <Icon name="search" size={15} color="var(--di-ink-mute)" />
          <span style={{ fontSize: 12, color: "#6f8296", flex: 1, textAlign: "left" }}>Search this session…</span>
          <span className="di-mono" style={{ fontSize: 10, color: "#6f8296" }}>⌘K</span>
        </button>
      </RailDock>

      {searchOpen && <SearchOverlay onSearch={onSearch} onClose={() => setSearchOpen(false)} />}

      {/* ── main: the agent conversation (live) ── */}
      <MainColumn style={{ background: "var(--cc-bg)" }}>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "14px 20px", borderBottom: "1px solid var(--cc-rule)" }}>
          <Icon name="asterisk" size={16} color="#c9d2dc" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--cc-ink)" }}>Claude Code</span>
          {chat.busy && (
            <button className="di-btn" onClick={onInterrupt} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 999, background: "#132018", border: "1px solid #23402e", fontSize: 10.5, color: "#5fbf7f", cursor: "pointer" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#5fbf7f", animation: "di-pulse 1.4s infinite" }} />working · stop
            </button>
          )}
          <span style={{ flex: 1 }} />
          {/* reasoning-effort picker — only for models that support it */}
          {(() => { const r = activeRow(models, chat.model, chat.activeModel); const lv = r ? (r.supportsEffort ? r.supportedEffortLevels : []) : []; return lv.length > 0 ? <EffortPicker value={chat.effort} levels={lv} onEffort={onEffort} /> : null; })()}
          {/* model picker (41a) */}
          <div style={{ position: "relative" }}>
            <button className="di-btn" onClick={() => setModelMenu((m) => !m)} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 28, padding: "0 12px", border: "1px solid #34608c", borderRadius: 999, background: "#0c2536", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--di-info)" }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--cc-ink)" }}>{activeRow(models, chat.model, chat.activeModel)?.displayName ?? (chat.model ?? "Default")}</span>
              <Icon name="chevron-down" size={13} color="var(--cc-ink-mute)" />
            </button>
            {modelMenu && (
              <>
                <div onClick={() => setModelMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                <div className="di-menu" style={{ position: "absolute", top: 34, right: 0, width: 260, zIndex: 21, border: "1px solid #2c5075", borderRadius: 13, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", padding: 9 }}>
                  <div className="di-eyebrow" style={{ padding: "5px 6px 8px", fontSize: 9, display: "flex", alignItems: "center", gap: 6 }}>
                    Model for this session
                    <button className="di-btn" onClick={onRefreshModels} title="Refresh model list"
                      style={{ marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
                      <Icon name="refresh-cw" size={11} color="var(--di-ink-mute)" />
                    </button>
                  </div>
                  {models === null && <div style={{ padding: "10px 12px", fontSize: 11.5, color: "#6f8296" }}>Loading models…</div>}
                  {models !== null && models.length === 0 && <div style={{ padding: "10px 12px", fontSize: 11.5, color: "var(--di-warn)" }}>No models returned — check Claude auth.</div>}
                  {(models ?? []).map((m) => {
                    const active = chat.model ? (chat.model === m.value || chat.model === m.resolvedModel) : false;
                    return (
                      <button key={m.value} className="di-row di-btn" onClick={() => { onModel(m.value); setModelMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 9, border: 0, background: active ? "#12283f" : "transparent", cursor: "pointer", marginBottom: 2 }}>
                        <Icon name={active ? "check-circle-2" : "circle"} size={15} color={active ? "var(--di-info)" : "#33475c"} />
                        <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 12.5, color: "var(--di-ink)" }}>{m.displayName}</span><span style={{ display: "block", fontSize: 10.5, color: "#6f8296" }}>{m.description}</span></span>
                      </button>
                    );
                  })}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 8px 4px", borderTop: "1px solid #17293a", marginTop: 4 }}>
                    <Icon name="lock" size={12} color="var(--di-ink-mute)" /><span style={{ fontSize: 10.5, color: "#6f8296" }}>Live from Claude Code. Applies to new messages.</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {claudeConnected === false
          ? <NotConnected onConnect={onConnect} />
          : <ChatBody chat={chat} onApproval={onApproval} onSend={onSend} />}

        {claudeConnected !== false && chat.messages.length > 0 && <Composer onSend={onSend} />}
      </MainColumn>
    </>
  );
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ width: 60, height: 60, margin: "0 auto 18px", borderRadius: 15, background: "#0e2233", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="lock" size={27} color="var(--di-info)" /></div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em", marginBottom: 8 }}>Connect Claude to start</div>
        <div style={{ fontSize: 13, color: "var(--di-ink-mute)", lineHeight: 1.55, marginBottom: 22 }}>Claude Code is not signed in yet. Connect your Anthropic account and the agent can begin working in this session.</div>
        <button className="di-btn" onClick={onConnect} style={{ height: 44, padding: "0 20px", border: 0, borderRadius: 11, background: "var(--di-spot)", color: "#3a140a", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="lock" size={15} />Connect Claude</button>
      </div>
    </div>
  );
}

const SUGGESTIONS = ["Explain this repo", "Add a failing test", "Fix the pending filter"];

function ChatBody({ chat, onApproval, onSend }: { chat: ChatState; onApproval: (id: string, d: "allow" | "always" | "deny" | "stop", input?: Record<string, unknown>) => void; onSend: (t: string) => void }) {
  if (chat.messages.length === 0) {
    return (
      <>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, marginBottom: 16, borderRadius: 15, background: "#0e2233", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="sparkles" size={26} color="var(--di-info)" /></div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--di-ink)", marginBottom: 7 }}>What should Claude build?</div>
          <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", marginBottom: 20 }}>Describe a change, paste an error, or pick a starting point.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center", maxWidth: 440 }}>
            {SUGGESTIONS.map((sug) => (
              <button key={sug} className="di-btn" onClick={() => onSend(sug)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", border: "1px solid var(--di-rule)", borderRadius: 999, background: "#0e2032", color: "var(--di-ink-soft)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="sparkles" size={12} color="var(--di-info)" />{sug}
              </button>
            ))}
          </div>
        </div>
        <Composer onSend={onSend} />
      </>
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
        // approval — a review instrument, not a yes/no prompt
        const pending = chat.pendingApprovalId === m.approvalId;
        return <ApprovalCard key={m.id} m={m} pending={pending} onApproval={onApproval} />;
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

const ROLE_META: Record<SearchHit["role"], { icon: string; color: string; label: string }> = {
  user: { icon: "user", color: "var(--di-spot)", label: "you" },
  agent: { icon: "asterisk", color: "var(--di-info)", label: "Claude" },
  tool: { icon: "terminal", color: "var(--di-warn)", label: "tool" },
  approval: { icon: "shield", color: "var(--di-warn)", label: "approval" },
  system: { icon: "alert-triangle", color: "var(--di-neg)", label: "system" },
};

/** Reasoning-effort picker — sits beside the model pill. Default is High. */
function EffortPicker({ value, levels, onEffort }: { value: string | null; levels: string[]; onEffort: (e: string | null) => void }) {
  const [open, setOpen] = useState(false);
  // Only levels this model actually supports (from the SDK catalog).
  const rows = levels.map((id) => ({ id, ...(EFFORT_META[id] ?? { label: id, sub: "" }) }));
  const current = rows.find((e) => e.id === value) ?? rows.find((e) => e.id === "high") ?? rows[rows.length - 1];
  return (
    <div style={{ position: "relative" }}>
      <button className="di-btn" onClick={() => setOpen((o) => !o)} title="Reasoning effort" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", border: "1px solid #34608c", borderRadius: 999, background: "#0c2536", cursor: "pointer" }}>
        <Icon name="flame" size={12} color="var(--di-warn)" />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--cc-ink)" }}>{current.label}</span>
        <Icon name="chevron-down" size={13} color="var(--cc-ink-mute)" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div className="di-menu" style={{ position: "absolute", top: 34, right: 0, width: 230, zIndex: 21, border: "1px solid #2c5075", borderRadius: 13, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", padding: 9 }}>
            <div className="di-eyebrow" style={{ padding: "5px 6px 8px", fontSize: 9 }}>Reasoning effort</div>
            {rows.map((e) => {
              const active = current.id === e.id;
              return (
                <button key={e.id} className="di-row di-btn" onClick={() => { onEffort(e.id); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 9, border: 0, background: active ? "#12283f" : "transparent", cursor: "pointer", marginBottom: 2 }}>
                  <Icon name={active ? "check-circle-2" : "circle"} size={15} color={active ? "var(--di-warn)" : "#33475c"} />
                  <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 12.5, color: "var(--di-ink)" }}>{e.label}</span><span style={{ display: "block", fontSize: 10.5, color: "#6f8296" }}>{e.sub}</span></span>
                </button>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 8px 4px", borderTop: "1px solid #17293a", marginTop: 4 }}>
              <Icon name="lock" size={12} color="var(--di-ink-mute)" /><span style={{ fontSize: 10.5, color: "#6f8296" }}>Higher effort = deeper thinking, more tokens. Applies to your next message.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** ⌘K transcript search — live against /api/sessions/:id/transcript/search. */
function SearchOverlay({ onSearch, onClose }: { onSearch: (q: string) => Promise<SearchHit[]>; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounce the query so we don't hit the endpoint on every keystroke.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setRan(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      void onSearch(term).then((h) => { setHits(h); setRan(true); }).finally(() => setBusy(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, onSearch]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,10,18,.62)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", maxHeight: "70vh", display: "flex", flexDirection: "column", border: "1px solid var(--di-rule)", borderRadius: 14, background: "var(--di-surface)", boxShadow: "0 24px 64px rgba(0,0,0,.5)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--di-rule)" }}>
          <Icon name="search" size={16} color="var(--di-ink-mute)" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this session's transcript…"
            style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--di-ink)", fontFamily: "inherit", fontSize: 13.5 }} />
          {busy && <Icon name="loader" size={14} color="var(--di-ink-mute)" />}
          <span className="di-mono" style={{ fontSize: 10, color: "#6f8296" }}>esc</span>
        </div>
        <div className="di-scroll" style={{ overflowY: "auto" }}>
          {ran && hits.length === 0 && (
            <div style={{ padding: "22px 18px", fontSize: 12.5, color: "var(--di-ink-mute)", textAlign: "center" }}>No matches in this session's transcript.</div>
          )}
          {!ran && !q.trim() && (
            <div style={{ padding: "22px 18px", fontSize: 12, color: "#6f8296", textAlign: "center", lineHeight: 1.6 }}>Search everything Claude and you have said, plus tool calls and approvals.</div>
          )}
          {hits.map((h, i) => {
            const r = ROLE_META[h.role];
            return (
              <div key={`${h.seq}-${i}`} style={{ display: "flex", gap: 10, padding: "10px 16px", borderTop: i ? "1px solid var(--di-rule)" : 0 }}>
                <Icon name={r.icon} size={13} color={r.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase", color: r.color, marginBottom: 3 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "var(--di-ink-soft)", lineHeight: 1.5, wordBreak: "break-word" }}>{h.snippet}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/** Real efficiency instrumentation — every number here is MEASURED from the
 *  SDK's per-turn usage, never seeded. RTK and caveman are both live features;
 *  what was missing was honest measurement, so tiles used to show invented
 *  percentages. A metric with no data says so rather than guessing. */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function EfficiencyPanel({ usage, cavemanSavings }: { usage: UsageSummary | null; cavemanSavings: string | null }) {
  const has = !!usage && usage.turns > 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <KpiTile eyebrow="Tokens" value={has ? fmtTokens(usage!.inputTokens + usage!.outputTokens) : "—"}
          unit={has ? `${usage!.turns} turn${usage!.turns === 1 ? "" : "s"}` : "no turns yet"}
          valueColor="var(--di-info)" border="#23415f" bg="#0f2842" eyebrowColor="var(--di-ink-mute)" />
        <KpiTile eyebrow="Cache reuse" value={has && usage!.cacheHitPct != null ? `${usage!.cacheHitPct}%` : "—"}
          unit="prompt cache" valueColor="var(--di-pos)" border="#2a3f2e" bg="#10241a" eyebrowColor="#8fb89a" />
      </div>
      {/* Caveman: lifetime savings from its own statusline + a MEASURED
          per-mode comparison from this session's turns. */}
      <div style={{ border: "1px solid #6a4a1a", borderRadius: 11, background: "#1a1206", padding: "9px 11px", marginBottom: 8 }}>
        <div className="di-eyebrow" style={{ color: "#c9a86a", marginBottom: 5, fontSize: 9 }}>Caveman · RTK</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span className="di-mono" style={{ fontSize: 15, fontWeight: 600, color: "var(--di-warn)" }}>{cavemanSavings ?? "—"}</span>
          <span style={{ fontSize: 9.5, color: "#a08a5e" }}>lifetime saved</span>
        </div>
        {usage?.cavemanDelta ? (
          <div style={{ fontSize: 10.5, color: "#e9dcc8", marginTop: 6, lineHeight: 1.45 }}>
            Measured here: <b>{usage.cavemanDelta.outputTokenReductionPct}%</b> fewer output tokens per turn
            on <b>{usage.cavemanDelta.best}</b> vs <b>{usage.cavemanDelta.worst}</b>.
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "#a08a5e", marginTop: 6, lineHeight: 1.45 }}>
            Run turns on two different dial settings (3+ each) and the measured token difference appears here.
          </div>
        )}
        {!!usage?.byMode.length && (
          <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
            {usage.byMode.map((m) => (
              <span key={m.mode} className="di-mono" style={{ fontSize: 9, color: "#c9a86a", border: "1px solid #4a3a1a", borderRadius: 999, padding: "1px 7px" }}>
                {m.mode} {Math.round(m.avgOutputTokens)}t/turn ·{m.turns}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/** The approval card. Uses everything the SDK gives us about a tool request:
 *  blast radius (description), the path that tripped it, why it was asked, and
 *  a subagent badge — plus two affordances a reviewer actually needs: EDIT the
 *  arguments (so a wrong `rm` path is fixed, not denied-and-re-prompted) and
 *  DENY & STOP (end the turn rather than let the agent try another way). */
function ApprovalCard({
  m, pending, onApproval,
}: {
  m: ChatMsg;
  pending: boolean;
  onApproval: (id: string, d: "allow" | "always" | "deny" | "stop", input?: Record<string, unknown>) => void;
}) {
  const a = m.approval;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(JSON.stringify(a?.input ?? {}, null, 2));
    setErr(null);
    setEditing(true);
  };
  const allowEdited = () => {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(draft) as Record<string, unknown>; }
    catch (e) { setErr(e instanceof Error ? e.message : "invalid JSON"); return; }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) { setErr("must be a JSON object"); return; }
    onApproval(m.approvalId!, "allow", parsed);
    setEditing(false);
  };

  return (
    <div style={{ alignSelf: "flex-start", border: "1px solid #3a2f18", borderRadius: 9, background: "#181206", padding: "10px 12px", maxWidth: "92%", minWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon name="terminal" size={13} color="#c99a4a" />
        <span style={{ fontSize: 11.5, color: "#d9c9a6", flex: 1 }}>{m.text}</span>
        {a?.agentID && (
          <span style={{ fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--di-info)", border: "1px solid #2c5075", borderRadius: 999, padding: "1px 6px" }}>subagent</span>
        )}
      </div>
      {/* Blast radius — the single most useful thing for a reviewer. */}
      {a?.description && (
        <div style={{ fontSize: 10.5, color: "#c9b184", lineHeight: 1.5, marginBottom: 5 }}>{a.description}</div>
      )}
      {a?.blockedPath && (
        <div className="di-mono" style={{ fontSize: 10, color: "var(--di-neg)", marginBottom: 4, wordBreak: "break-all" }}>
          ⚠ {a.blockedPath}
        </div>
      )}
      {a?.decisionReason && (
        <div style={{ fontSize: 10, color: "#a08a5e", marginBottom: 6, lineHeight: 1.45 }}>{a.decisionReason}</div>
      )}
      {pending && a && !editing && Object.keys(a.input).length > 0 && (
        <pre className="di-mono" style={{ margin: "0 0 8px", padding: "7px 9px", background: "#0d0904", border: "1px solid #3a2f18", borderRadius: 7, fontSize: 10, color: "#b9a882", maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {JSON.stringify(a.input, null, 2).slice(0, 1200)}
        </pre>
      )}
      {pending && editing && (
        <>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="di-mono"
            style={{ width: "100%", minHeight: 110, padding: "7px 9px", background: "#0d0904", border: "1px solid #6a4a1a", borderRadius: 7, color: "#e9dcc8", fontSize: 10.5, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 6 }} />
          {err && <div style={{ fontSize: 10.5, color: "var(--di-neg)", marginBottom: 6 }}>{err}</div>}
        </>
      )}
      {pending && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <ApprovalBtn label="Run edited" tone="allow" onClick={allowEdited} />
              <ApprovalBtn label="Cancel" tone="ghost" onClick={() => setEditing(false)} />
            </>
          ) : (
            <>
              <ApprovalBtn label="Allow" tone="allow" onClick={() => onApproval(m.approvalId!, "allow")} />
              {a?.canAlways && <ApprovalBtn label="Always" tone="always" onClick={() => onApproval(m.approvalId!, "always")} />}
              {a && Object.keys(a.input).length > 0 && <ApprovalBtn label="Edit" tone="ghost" onClick={startEdit} />}
              <ApprovalBtn label="Deny" tone="deny" onClick={() => onApproval(m.approvalId!, "deny")} />
              <ApprovalBtn label="Deny & stop" tone="stop" onClick={() => onApproval(m.approvalId!, "stop")} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalBtn({ label, tone, onClick }: { label: string; tone: "allow" | "always" | "deny" | "stop" | "ghost"; onClick: () => void }) {
  const styles: Record<string, React.CSSProperties> = {
    allow: { background: "#2a6a44", color: "#eafff1", border: 0 },
    always: { background: "#1f8a5b", color: "#eafff1", border: 0 },
    deny: { background: "transparent", color: "var(--di-neg)", border: "1px solid #4a2020" },
    stop: { background: "#4a2020", color: "#ffb3a6", border: "1px solid #6a2a2a" },
    ghost: { background: "transparent", color: "var(--di-ink-mute)", border: "1px solid var(--di-rule)" },
  };
  return (
    <button className="di-btn" onClick={onClick}
      style={{ height: 28, padding: "0 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", ...styles[tone] }}>
      {label}
    </button>
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
