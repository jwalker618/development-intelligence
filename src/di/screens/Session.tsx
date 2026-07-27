import { useEffect, useRef, useState } from "react";
import { Icon, RailTitle } from "../primitives";
import { RailScroll, RailDock, MainColumn } from "../Shell";
import type { ChatMsg, ChatState } from "../control";
import type { SAMPLE } from "../control";
import type { ChatStatus, ModelRow, RewindResult, SearchHit, UsageSummary } from "../../api";
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
  s, chat, cavemanSavings, sample, claudeConnected, onConnect, onCaveman, onSend, onApproval, onInterrupt, models, usage, status, onModel, onEffort, onRefreshModels, onPermissionMode, onReadOnly, onBudget, onMaxTurns, onPreviewRewind, onRewind, onAddPin, onRemovePin, onSearch,
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
  status: ChatStatus | null;
  onModel: (m: string) => void;
  onEffort: (e: string | null) => void;
  onRefreshModels: () => void;
  onPermissionMode: (mode: string) => void;
  onReadOnly: (on: boolean) => void;
  onBudget: (usd: number | null) => void;
  onMaxTurns: (t: number | null) => void;
  onPreviewRewind: (uuid: string) => Promise<RewindResult>;
  onRewind: (uuid: string) => Promise<RewindResult>;
  onAddPin: (icon: string, label: string) => void;
  onRemovePin: (id: string) => void;
  onSearch: (q: string) => Promise<SearchHit[]>;
}) {
  const pins = s.pins;
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

        <EfficiencyPanel usage={usage} cavemanSavings={cavemanSavings} costsAreReal={status?.costsAreReal ?? false} />

        <ContextMeter context={status?.context ?? null} limits={chat.limits} />

        <HookLiveness hooks={chat.hooks} />

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
          {chat.busy && chat.thinkingTokens > 0 && (
            <span className="di-mono" title="Estimated reasoning tokens for this turn"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 999, background: "#141d33", border: "1px solid #2c3f5a", fontSize: 10.5, color: "#8fa6d0" }}>
              <Icon name="sparkles" size={10} color="#8fa6d0" />thinking · {fmtTokens(chat.thinkingTokens)}
            </span>
          )}
          {chat.busy && (
            <button className="di-btn" onClick={onInterrupt} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 999, background: "#132018", border: "1px solid #23402e", fontSize: 10.5, color: "#5fbf7f", cursor: "pointer" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#5fbf7f", animation: "di-pulse 1.4s infinite" }} />working · stop
            </button>
          )}
          <span style={{ flex: 1 }} />
          {/* how much the agent may do without asking — the leash */}
          <LeashPill
            mode={chat.permissionMode}
            readOnly={chat.readOnly}
            budgetUsd={chat.budgetUsd}
            maxTurns={chat.maxTurns}
            costsAreReal={status?.costsAreReal ?? false}
            onMode={onPermissionMode}
            onReadOnly={onReadOnly}
            onBudget={onBudget}
            onMaxTurns={onMaxTurns}
          />
          {/* Model and effort are ONE chip. Merging them is what makes the
              header fit — five controls do not survive a 390px row (43c). */}
          <RunChip models={models} chat={chat} onModel={onModel} onEffort={onEffort} onRefreshModels={onRefreshModels} />
        </div>

        {claudeConnected === false
          ? <NotConnected onConnect={onConnect} />
          : <ChatBody chat={chat} onApproval={onApproval} onSend={onSend} onPreviewRewind={onPreviewRewind} onRewind={onRewind} />}

        {claudeConnected !== false && chat.messages.length > 0 && (
          <Composer onSend={onSend} suggestion={!chat.busy ? chat.suggestion : null} />
        )}
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

/** Cold-start chips. MEASURED: the CLI emits no slash-command inventory and no
 *  model-authored suggestion until after turn one, so a brand-new session has
 *  nothing real to offer — these three cover exactly that gap and are replaced
 *  by the repo's actual commands the moment the CLI reports them. */
const STARTERS = ["Explain this repo", "Add a failing test", "Fix the pending filter"];

/** Commands that are noise as a starting point — they act on a conversation
 *  that does not exist yet, or on DI's own surfaces. */
const CHIP_SKIP = /^(help|clear|exit|quit|compact|usage|cost|stats|resume|logout|login|config|status|doctor|upgrade|release-notes|bug|feedback|privacy|terms|vim|theme|model|memory)$/i;

function ChatBody({ chat, onApproval, onSend, onPreviewRewind, onRewind }: {
  chat: ChatState;
  onApproval: (id: string, d: "allow" | "always" | "deny" | "stop", input?: Record<string, unknown>) => void;
  onSend: (t: string) => void;
  onPreviewRewind: (uuid: string) => Promise<RewindResult>;
  onRewind: (uuid: string) => Promise<RewindResult>;
}) {
  // Real slash commands when the CLI has told us what this repo has; the
  // hardcoded trio only while it hasn't.
  const real = (chat.signals?.commands ?? [])
    .filter((c) => c.name && !CHIP_SKIP.test(c.name) && !c.argumentHint)
    .slice(0, 6);
  const starters = real.length
    ? real.map((c) => ({ label: `/${c.name}`, send: `/${c.name}`, title: c.description || `/${c.name}`, command: true }))
    : STARTERS.map((t) => ({ label: t, send: t, title: t, command: false }));

  if (chat.messages.length === 0) {
    return (
      <>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, marginBottom: 16, borderRadius: 15, background: "#0e2233", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="sparkles" size={26} color="var(--di-info)" /></div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--di-ink)", marginBottom: 7 }}>What should Claude build?</div>
          <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", marginBottom: 20 }}>Describe a change, paste an error, or pick a starting point.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center", maxWidth: 440 }}>
            {starters.map((c) => (
              <button key={c.label} className="di-btn" title={c.title} onClick={() => onSend(c.send)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", border: "1px solid var(--di-rule)", borderRadius: 999, background: "#0e2032", color: "var(--di-ink-soft)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name={c.command ? "square-terminal" : "sparkles"} size={12} color="var(--di-info)" />{c.label}
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
          <UserBubble key={m.id} m={m} onPreviewRewind={onPreviewRewind} onRewind={onRewind} />
        );
        if (m.role === "agent") return (
          <div key={m.id} style={{ maxWidth: "86%", fontSize: 12.5, lineHeight: 1.6, color: "#aeb9c5", whiteSpace: "pre-wrap" }}>{m.text}</div>
        );
        if (m.role === "tool") return (
          <div key={m.id} style={{ width: "100%", maxWidth: 520, border: "1px solid var(--cc-rule)", borderRadius: 9, background: "#0f1720", opacity: m.provisional ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px" }}>
              <Icon name="file-pen" size={13} color="#7f8c9a" />
              <span className="di-mono" style={{ fontSize: 11, color: "#c9d2dc", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.text}{m.file ? ` · ${m.file}` : ""}</span>
              {/* Elapsed time only once it is long enough to be worth saying. */}
              {typeof m.elapsed === "number" && m.elapsed >= 3 && (
                <span className="di-mono" style={{ flex: "0 0 auto", fontSize: 10, color: "#6f8296" }}>{m.elapsed}s</span>
              )}
            </div>
          </div>
        );
        // Auto-denied by a rule, mode or classifier — canUseTool was never
        // called, so without this row the agent just looks like it gave up.
        if (m.role === "denied") return (
          <div key={m.id} style={{ width: "100%", maxWidth: 520, display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", border: "1px solid #4a2b2b", borderRadius: 9, background: "#1a1010" }}>
            <Icon name="shield-off" size={13} color="var(--di-neg)" />
            <span className="di-mono" style={{ fontSize: 11, color: "#e2a5a5" }}>
              blocked · {m.text}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "#8a6a6a" }}>{m.level}</span>
          </div>
        );
        // A banner from the loop — most often a hook's block reason, which used
        // to vanish and leave a prompt that appeared to do nothing.
        if (m.role === "notice") {
          const warn = m.level === "warning" || m.stops;
          return (
            <div key={m.id} style={{ width: "100%", maxWidth: 560, display: "flex", gap: 8, padding: "9px 12px", border: `1px solid ${warn ? "#5a3316" : "#24384f"}`, borderRadius: 9, background: warn ? "#1a1206" : "#101a24" }}>
              <Icon name={warn ? "alert-triangle" : "info"} size={13} color={warn ? "var(--di-warn)" : "var(--di-ink-mute)"} style={{ flex: "0 0 auto", marginTop: 2 }} />
              <span style={{ fontSize: 11.5, lineHeight: 1.5, color: warn ? "#e8c9a0" : "#93a4b5", whiteSpace: "pre-wrap" }}>
                {m.text}{m.stops ? " · the turn stopped here" : ""}
              </span>
            </div>
          );
        }
        // A receipt for an undo that actually happened.
        if (m.role === "rewound") return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 0" }}>
            <span style={{ flex: 1, height: 1, background: "#3a2a1a" }} />
            <span className="di-mono" style={{ fontSize: 10, color: "var(--di-warn)" }}>{m.text}</span>
            <span style={{ flex: 1, height: 1, background: "#3a2a1a" }} />
          </div>
        );
        // Compaction silently changes what the agent remembers. Mark it.
        if (m.role === "compacted") return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 0" }}>
            <span style={{ flex: 1, height: 1, background: "#2a3a49" }} />
            <span className="di-mono" style={{ fontSize: 10, color: "#6f8296" }}>{m.text}</span>
            <span style={{ flex: 1, height: 1, background: "#2a3a49" }} />
          </div>
        );
        // approval — a review instrument, not a yes/no prompt
        const pending = chat.pendingApprovalId === m.approvalId;
        return <ApprovalCard key={m.id} m={m} pending={pending} onApproval={onApproval} />;
      })}
    </div>
  );
}

/**
 * A user message, with the one undo DI has.
 *
 * "Rewind here" restores every file the agent changed SINCE this message. It
 * is a two-step: a dry run reports the file count and line delta, and only
 * then does the confirm touch disk — the same shape as the typed-challenge
 * gate elsewhere, scaled to the blast radius.
 *
 * The transcript does NOT rewind with the files. There is no counterpart in
 * the SDK, so the card says so rather than implying the conversation moved.
 */
function UserBubble({ m, onPreviewRewind, onRewind }: {
  m: ChatMsg;
  onPreviewRewind: (uuid: string) => Promise<RewindResult>;
  onRewind: (uuid: string) => Promise<RewindResult>;
}) {
  const [preview, setPreview] = useState<RewindResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const ask = () => {
    if (!m.uuid) return;
    setBusy(true);
    void onPreviewRewind(m.uuid).then(setPreview).finally(() => setBusy(false));
  };
  const confirm = () => {
    if (!m.uuid) return;
    setBusy(true);
    void onRewind(m.uuid)
      .then((r) => { setPreview(r.canRewind ? null : r); setDone(r.canRewind); })
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ alignSelf: "flex-end", maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
      <div style={{ background: "#1c2836", border: "1px solid #2a3a49", borderRadius: "12px 12px 4px 12px", padding: "10px 13px", fontSize: 12.5, lineHeight: 1.5, color: "#dbe3ec", whiteSpace: "pre-wrap" }}>{m.text}</div>

      {/* Only messages we stamped can be rewound to — older transcripts have
          no anchor, and offering a dead button would be worse than none. */}
      {m.uuid && !done && !preview && (
        <button className="di-btn" onClick={ask} disabled={busy}
          style={{ border: 0, background: "transparent", color: "#586573", fontFamily: "inherit", fontSize: 10.5, cursor: "pointer", padding: "0 2px" }}>
          {busy ? "checking…" : "↩ rewind here"}
        </button>
      )}

      {preview && (
        <div style={{ width: 280, border: `1px solid ${preview.canRewind ? "#5a3316" : "#3a4653"}`, borderRadius: 10, background: preview.canRewind ? "#1a1206" : "#141d26", padding: "10px 12px" }}>
          {preview.canRewind ? (
            <>
              <div style={{ fontSize: 11.5, color: "#e8c9a0", lineHeight: 1.5, marginBottom: 8 }}>
                Restores <b>{preview.filesChanged?.length ?? 0}</b> file{(preview.filesChanged?.length ?? 0) === 1 ? "" : "s"}
                {" "}(<span style={{ color: "var(--di-pos)" }}>+{preview.insertions ?? 0}</span>{" "}
                <span style={{ color: "var(--di-neg)" }}>−{preview.deletions ?? 0}</span>) to their state before this message.
                The conversation stays as it is — only files move.
              </div>
              {!!preview.filesChanged?.length && (
                <div className="di-mono" style={{ fontSize: 9.5, color: "#a08a5e", lineHeight: 1.6, marginBottom: 9, maxHeight: 60, overflowY: "auto" }}>
                  {preview.filesChanged.slice(0, 6).map((f) => <div key={f}>{f.split("/").slice(-2).join("/")}</div>)}
                  {preview.filesChanged.length > 6 && <div>… {preview.filesChanged.length - 6} more</div>}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="di-btn" onClick={() => setPreview(null)}
                  style={{ flex: 1, height: 30, border: "1px solid var(--di-rule)", borderRadius: 8, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}>Cancel</button>
                <button className="di-btn" onClick={confirm} disabled={busy}
                  style={{ flex: 1, height: 30, border: 0, borderRadius: 8, background: "var(--di-warn)", color: "#1a1206", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                  {busy ? "Restoring…" : "Restore files"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#8fa6b5", lineHeight: 1.5 }}>
              Can't rewind to here — {preview.error ?? "no checkpoint"}.
              <button className="di-btn" onClick={() => setPreview(null)}
                style={{ marginLeft: 6, border: 0, background: "transparent", color: "var(--di-info)", fontFamily: "inherit", fontSize: 11, cursor: "pointer", padding: 0 }}>dismiss</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Composer({ onSend, suggestion }: { onSend: (t: string) => void; suggestion?: string | null }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = () => { const t = text.trim(); if (!t) return; onSend(t); setText(""); if (ref.current) ref.current.style.height = "auto"; };
  return (
    <div style={{ flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid var(--cc-rule)" }}>
      {/* The model's OWN suggested next step. One chip, offered not assumed —
          tapping fills the composer rather than sending, so the human still
          presses send. */}
      {suggestion && !text && (
        <button className="di-btn" onClick={() => { setText(suggestion); ref.current?.focus(); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%", marginBottom: 9, padding: "7px 12px", border: "1px solid #2c5075", borderRadius: 999, background: "#0e2032", color: "var(--di-ink-soft)", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <Icon name="sparkles" size={11} color="var(--di-info)" style={{ flex: "0 0 auto" }} />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggestion}</span>
        </button>
      )}
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

/**
 * Model and effort in one chip.
 *
 * The header carries title · thinking · working/stop · leash · run — five
 * things. At 390px that is one row too many, so model and effort merge into a
 * single `Sonnet 4.5 · high` chip that opens a sheet with both (43a/43c).
 */
function RunChip({ models, chat, onModel, onEffort, onRefreshModels }: {
  models: ModelRow[] | null;
  chat: ChatState;
  onModel: (m: string) => void;
  onEffort: (e: string | null) => void;
  onRefreshModels: () => void;
}) {
  const [open, setOpen] = useState(false);
  const row = activeRow(models, chat.model, chat.activeModel);
  const levels = row?.supportsEffort ? row.supportedEffortLevels : [];
  const name = row?.displayName ?? chat.model ?? "Default";
  return (
    <div style={{ position: "relative" }}>
      <button className="di-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Model and effort"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", border: "1px solid #24384f", borderRadius: 999, background: "#0c2536", cursor: "pointer" }}>
        <span style={{ fontSize: 11.5, color: "var(--cc-ink)" }}>{name}</span>
        {chat.effort && levels.length > 0 && (
          <>
            <span style={{ color: "#3e5670" }}>·</span>
            <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink-mute)" }}>{chat.effort}</span>
          </>
        )}
        <Icon name="chevron-down" size={12} color="var(--cc-ink-mute)" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div className="di-menu" style={{ position: "absolute", top: 34, right: 0, width: 288, maxWidth: "calc(100vw - 32px)", zIndex: 21, border: "1px solid #2c5075", borderRadius: 13, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", padding: 9 }}>
            <div className="di-eyebrow" style={{ padding: "5px 6px 8px", fontSize: 9, display: "flex", alignItems: "center", gap: 6 }}>
              Model
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
                <button key={m.value} className="di-row di-btn" onClick={() => onModel(m.value)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 9, border: 0, background: active ? "#12283f" : "transparent", cursor: "pointer", marginBottom: 2 }}>
                  <Icon name={active ? "check-circle-2" : "circle"} size={15} color={active ? "var(--di-info)" : "#33475c"} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--di-ink)" }}>{m.displayName}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: "#6f8296" }}>{m.description}</span>
                  </span>
                </button>
              );
            })}
            {levels.length > 0 && (
              <div style={{ borderTop: "1px solid #17293a", marginTop: 5, paddingTop: 9 }}>
                <div className="di-eyebrow" style={{ padding: "0 6px 8px", fontSize: 9 }}>Effort</div>
                <div style={{ display: "flex", gap: 4, padding: "0 4px 4px" }}>
                  {levels.map((lv) => {
                    const on = chat.effort === lv;
                    return (
                      <button key={lv} className="di-btn" onClick={() => onEffort(on ? null : lv)} title={EFFORT_META[lv]?.sub ?? lv}
                        style={{ flex: 1, height: 30, borderRadius: 8, border: `1px solid ${on ? "#34608c" : "transparent"}`, background: on ? "#12283f" : "transparent", color: on ? "var(--di-ink)" : "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
                        {EFFORT_META[lv]?.label ?? lv}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 8px 4px", borderTop: "1px solid #17293a", marginTop: 4 }}>
              <Icon name="lock" size={12} color="var(--di-ink-mute)" /><span style={{ fontSize: 10.5, color: "#6f8296" }}>Live from Claude Code. Applies to new messages.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

function EfficiencyPanel({ usage, cavemanSavings, costsAreReal }: { usage: UsageSummary | null; cavemanSavings: string | null; costsAreReal: boolean }) {
  const has = !!usage && usage.turns > 0;
  void costsAreReal; // no dollar tile here yet — see LeashPill for the gated one
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


/**
 * Live context-window accounting, straight from the CLI.
 *
 * This is the honest replacement for a "% context saved" figure: there is no
 * counterfactual anywhere in the SDK for what a turn would have cost without
 * caveman, so we show what the window ACTUALLY holds and what is filling it.
 */
function ContextMeter({ context, limits }: { context: ChatStatus["context"]; limits: ChatState["limits"] }) {
  if (!context && !limits) return null;
  const pct = context ? Math.min(100, Math.round(context.percentage)) : 0;
  // Warn before auto-compact rather than after: compaction is where an agent
  // quietly forgets the thing you told it forty turns ago.
  const tone = pct >= 85 ? "var(--di-neg)" : pct >= 65 ? "var(--di-warn)" : "var(--di-info)";
  const top = context
    ? [...context.categories].filter((c) => c.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, 3)
    : [];
  return (
    <div style={{ marginBottom: 12, border: "1px solid #23415f", borderRadius: 11, background: "#0f2842", padding: "9px 11px" }}>
      <div className="di-eyebrow" style={{ marginBottom: 6, fontSize: 9, display: "flex", alignItems: "center", gap: 6 }}>
        Context window
        {context && <span className="di-mono" style={{ marginLeft: "auto", color: tone, fontWeight: 600 }}>{pct}%</span>}
      </div>
      {context ? (
        <>
          <div style={{ height: 5, borderRadius: 999, background: "#12283f", overflow: "hidden", marginBottom: 7 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: tone }} />
          </div>
          <div className="di-mono" style={{ fontSize: 9.5, color: "#6f8296", marginBottom: top.length ? 6 : 0 }}>
            {fmtTokens(context.totalTokens)} of {fmtTokens(context.maxTokens)}
            {pct >= 85 ? " · auto-compact is close" : ""}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {top.map((c) => (
              <span key={c.name} className="di-mono" style={{ fontSize: 9, color: "#93a4b5", border: "1px solid #24384f", borderRadius: 999, padding: "1px 7px" }}>
                {c.name} {fmtTokens(c.tokens)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 10.5, color: "#6f8296", lineHeight: 1.45 }}>Starts reporting once Claude Code is running.</div>
      )}
      {limits?.utilization != null && (
        <div style={{ fontSize: 10, color: limits.status === "allowed" ? "#6f8296" : "var(--di-warn)", marginTop: 7, lineHeight: 1.45 }}>
          Plan window: {Math.round(limits.utilization * 100)}% used
          {limits.resetsAt ? ` · resets ${new Date(limits.resetsAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      )}
    </div>
  );
}

/**
 * Did caveman and RTK actually fire?
 *
 * A boolean per hook run, honestly labelled — not a percentage. Nothing is
 * shown until a hook has actually run, so a session with no hooks configured
 * says nothing rather than implying failure.
 */
function HookLiveness({ hooks }: { hooks: ChatState["hooks"] }) {
  if (!hooks.length) return null;
  // Latest run wins per hook name — "did it work last time" is the question.
  const latest = new Map<string, ChatState["hooks"][number]>();
  for (const h of hooks) latest.set(h.name, h);
  const rows = [...latest.values()].slice(-6);
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="di-eyebrow" style={{ marginBottom: 6, fontSize: 9 }}>Hooks · last run</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {rows.map((h) => {
          const ok = h.outcome === "success";
          return (
            <span key={h.name} title={`${h.event} · exit ${h.exitCode ?? "?"}`} className="di-mono"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, color: ok ? "var(--di-pos)" : "var(--di-neg)",
                border: `1px solid ${ok ? "#2a3f2e" : "#4a2b2b"}`, borderRadius: 999, padding: "2px 8px" }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: ok ? "var(--di-pos)" : "var(--di-neg)" }} />
              {h.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The leash — how much rope the agent has.
 *
 * Design 43a–43d. Three things carry the mode instead of one grey pill: a
 * glyph, a label, and a four-notch ROPE GAUGE. The ladder is ordered tightest →
 * loosest so the gauge fills downward and the order itself carries meaning —
 * "waits" and "refuses" are never the same object.
 */
interface Leash {
  id: string;
  label: string;
  /** Present tense, second person — this is the posture readout, not a hint. */
  readout: string;
  sub: string;
  tone: string;
  icon: string;
  /** Filled notches out of four; `dashed` marks the one Plan first shows. */
  notches: number;
  dashed?: boolean;
  /** Fail closed is the only one that reads as a lock. */
  lock?: boolean;
  /** Fill for the unlit notches when this mode is the active one. */
  dim: string;
}

const LEASH: Leash[] = [
  { id: "dontAsk", label: "Fail closed", tone: "var(--di-neg)", icon: "shield-x", notches: 0, lock: true, dim: "#3a1c1c",
    readout: "The agent refuses anything not already approved. It will not come back to ask.",
    sub: "Refuses anything not already approved. It will not come back to ask." },
  { id: "plan", label: "Plan first", tone: "var(--di-aux)", icon: "list-checks", notches: 1, dashed: true, dim: "#1c2540",
    readout: "The agent proposes and touches nothing. Approving means reading the plan and coming back here.",
    sub: "Proposes and touches nothing. Approving means reading the plan and coming back here." },
  { id: "default", label: "Ask me", tone: "var(--di-spot)", icon: "hand", notches: 1, dim: "#3a2013",
    readout: "The agent stops and waits for you before every state change.",
    sub: "Every state change waits for your yes — edits, commands, everything." },
  { id: "acceptEdits", label: "Auto-accept edits", tone: "var(--di-info)", icon: "fast-forward", notches: 3, dim: "#123830",
    readout: "File edits go through on their own. Commands still stop and wait for you.",
    sub: "File edits go through without asking. Commands still stop for you." },
];

const leashOf = (id: string): Leash => LEASH.find((l) => l.id === id) ?? LEASH[2];

/** The rope. Four notches, filled left to right; `dashed` outlines the first
 *  instead of filling it, which is how "proposes but does not act" reads. */
function RopeGauge({ l, lit, size = 9 }: { l: Leash; lit: boolean; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center", flex: "0 0 auto" }}>
      {l.lock && <Icon name="lock" size={10} color={l.tone} style={{ marginRight: 2 }} />}
      {[0, 1, 2, 3].map((i) => {
        const on = i < l.notches;
        const dashed = on && l.dashed;
        return (
          <span key={i} style={{
            width: size, height: 4, borderRadius: 2, boxSizing: "border-box",
            ...(dashed
              ? { border: `1px dashed ${l.tone}` }
              : { background: on ? l.tone : lit ? l.dim : "#24384f" }),
          }} />
        );
      })}
    </span>
  );
}

function LeashPill({ mode, readOnly, budgetUsd, maxTurns, costsAreReal, onMode, onReadOnly, onBudget, onMaxTurns }: {
  mode: string;
  readOnly: boolean;
  budgetUsd: number | null;
  maxTurns: number | null;
  costsAreReal: boolean;
  onMode: (m: string) => void;
  onReadOnly: (on: boolean) => void;
  onBudget: (usd: number | null) => void;
  onMaxTurns: (t: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [turnsDraft, setTurnsDraft] = useState("");
  const cur = leashOf(mode);

  return (
    <div style={{ position: "relative" }}>
      <button className="di-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label={readOnly ? "Review-only" : `Leash: ${cur.label}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 28, padding: "0 11px",
          border: `1px solid ${readOnly ? "#2a6b5e" : "#3a2a20"}`, borderRadius: 999,
          background: readOnly ? "#0e2a26" : "#2a150c", cursor: "pointer" }}>
        <Icon name={readOnly ? "shield-check" : cur.icon} size={13} color={readOnly ? "var(--di-info)" : cur.tone} />
        <span style={{ fontSize: 12, fontWeight: 600, color: readOnly ? "#b8f2e5" : "#fbd0ba" }}>
          {readOnly ? "Review-only" : cur.label}
        </span>
        {!readOnly && <RopeGauge l={cur} lit />}
        <Icon name="chevron-down" size={12} color="var(--cc-ink-mute)" />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div className="di-menu" style={{ position: "absolute", top: 34, right: 0, width: 412, maxWidth: "calc(100vw - 32px)", zIndex: 21, border: "1px solid #2c5075", borderRadius: 14, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", padding: "13px 14px 14px" }}>
            <div className="di-eyebrow" style={{ fontSize: 9.5, marginBottom: 9 }}>Leash</div>

            {readOnly ? (
              <>
                {/* Review-only OUTRANKS the modes: it is a guarantee, so it
                    takes the top of the panel and the ladder parks below it. */}
                <div style={{ border: "1px solid #2a6b5e", borderRadius: 12, background: "#0e2a26", padding: "12px 13px", marginBottom: 9 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 9 }}>
                    <span style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, background: "#12352f", border: "1px solid #2a6b5e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="shield-check" size={16} color="var(--di-info)" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="di-eyebrow" style={{ fontSize: 9, color: "var(--di-info)" }}>Right now</div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--di-ink)" }}>Review-only · on</div>
                    </div>
                    <Toggle on onChange={() => onReadOnly(false)} label="Review-only" />
                  </div>
                  <div style={{ fontSize: 12, color: "#c9e6df", lineHeight: 1.5, marginBottom: 10 }}>
                    Write, Edit and Bash are <b style={{ color: "var(--di-ink)" }}>not in this session</b>. This is a
                    guarantee, not a preference — the tools are gone, so there is nothing to deny.
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {["Write", "Edit", "Bash"].map((t) => (
                      <span key={t} className="di-mono" style={{ fontSize: 10.5, color: "#6f8296", textDecoration: "line-through", border: "1px solid #24384f", borderRadius: 999, padding: "2px 11px", background: "#0c1e30" }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ border: "1px solid #24384f", borderRadius: 11, background: "#0c1e30", padding: "10px 12px", marginBottom: 11, fontSize: 11.5, color: "#93a4b5", lineHeight: 1.5 }}>
                  Verified: asked to write a file, the agent tried Write, tried to route it through a subagent, and the file was never created.
                </div>
              </>
            ) : (
              /* The at-a-glance answer, tinted to the current mode. The ladder
                 below is the change control; this is the readout. */
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, border: `1px solid ${cur.tone}44`, borderRadius: 12, background: "#1e1109", padding: "12px 13px", marginBottom: 13 }}>
                <span style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, background: "#2a150c", border: `1px solid ${cur.tone}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={cur.icon} size={16} color={cur.tone} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="di-eyebrow" style={{ fontSize: 9, color: cur.tone, marginBottom: 2 }}>Right now</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--di-ink)", lineHeight: 1.4 }}>{cur.readout}</div>
                </div>
              </div>
            )}

            <div className="di-eyebrow" style={{ fontSize: 9.5, padding: "0 2px 9px", display: "flex", alignItems: "center" }}>
              How much rope
              {readOnly && <span style={{ marginLeft: "auto", fontSize: 10, textTransform: "none", letterSpacing: 0, color: "#6f8296", fontWeight: 400 }}>parked</span>}
            </div>

            <div style={{ opacity: readOnly ? 0.42 : 1 }}>
              {LEASH.map((l) => {
                const active = l.id === mode;
                return (
                  <button key={l.id} className="di-qrow di-btn" disabled={readOnly}
                    onClick={() => { onMode(l.id); setOpen(false); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 11, width: "100%", textAlign: "left",
                      padding: readOnly ? "8px 11px" : "10px 11px", borderRadius: 11, marginBottom: 6,
                      border: `1px solid ${active && !readOnly ? `${l.tone}55` : "#16334f"}`,
                      background: active && !readOnly ? "#160f0a" : "transparent",
                      cursor: readOnly ? "default" : "pointer" }}>
                    <span style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: 9, background: "#12283f", border: "1px solid #24384f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={l.icon} size={15} color={l.tone} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--di-ink)" }}>{l.label}</span>
                        {l.id === "default" && !readOnly && (
                          <span className="di-eyebrow" style={{ fontSize: 8.5, color: "var(--di-spot)", border: "1px solid #5a3316", borderRadius: 999, padding: "1px 6px" }}>default</span>
                        )}
                        {active && readOnly && (
                          <span className="di-eyebrow" style={{ fontSize: 8.5, color: "#6f8296", border: "1px solid #24384f", borderRadius: 999, padding: "1px 6px" }}>was set</span>
                        )}
                        <span style={{ marginLeft: "auto" }}><RopeGauge l={l} lit={active} /></span>
                      </span>
                      {!readOnly && (
                        <span style={{ display: "block", fontSize: 11.5, color: "#98a6b8", lineHeight: 1.45, marginTop: 3 }}>{l.sub}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {readOnly ? (
              <div style={{ fontSize: 11, color: "#6f8296", padding: "2px 2px 11px" }}>Modes come back when review-only is off.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, border: "1px solid #16334f", borderRadius: 11, padding: "10px 11px", marginBottom: 11 }}>
                <span style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: 9, background: "#12283f", border: "1px solid #24384f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="shield-check" size={15} color="#6f8296" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--di-ink)" }}>Review-only</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "#98a6b8", lineHeight: 1.45 }}>Not a mode — it removes Write, Edit and Bash from the session.</span>
                </span>
                <Toggle on={false} onChange={() => onReadOnly(true)} label="Review-only" />
              </div>
            )}

            {/* Both numeric limits under one heading, because the obvious
                question is why there are two. */}
            <div style={{ borderTop: "1px solid #17293a", paddingTop: 11 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                <span className="di-eyebrow" style={{ fontSize: 9.5 }}>Brakes</span>
                {costsAreReal && <span style={{ fontSize: 10, color: "#6f8296" }}>billed rates · API key</span>}
              </div>
              <div style={{ fontSize: 11, color: "#6f8296", lineHeight: 1.45, marginBottom: 9 }}>
                Two different runaways: one costs money, one costs you a review.
              </div>

              <BrakeRow label="Stop after" unit="turns" value={maxTurns} draft={turnsDraft} setDraft={setTurnsDraft}
                onSet={(n) => { onMaxTurns(n); setOpen(false); }}
                note="A cheap model can loop for hours for pennies and leave you a hundred files to read. Offered on every account." />

              {costsAreReal ? (
                <BrakeRow label="Spend ceiling" unit="" prefix="$" value={budgetUsd} draft={budgetDraft} setDraft={setBudgetDraft}
                  onSet={(n) => { onBudget(n); setOpen(false); }}
                  note="The turn stops when the session's spend passes this. Raise it here to carry on." />
              ) : (
                /* Prose, not a disabled input — the menu keeps its shape
                   between accounts, so the brake does not appear to vanish. */
                <div>
                  <div style={{ fontSize: 12, color: "var(--di-ink-soft)", marginBottom: 3 }}>Spend ceiling</div>
                  <div style={{ fontSize: 11.5, color: "#6f8296", lineHeight: 1.5 }}>
                    Not available on this account — you are signed in on a subscription, so the dollar figures are
                    notional. It comes back with an API key.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** One numeric brake. Empty means no limit — never a 0. */
function BrakeRow({ label, unit, prefix, value, draft, setDraft, onSet, note }: {
  label: string; unit: string; prefix?: string; value: number | null;
  draft: string; setDraft: (v: string) => void; onSet: (n: number | null) => void; note: string;
}) {
  const commit = () => { const n = Number(draft); onSet(Number.isFinite(n) && n > 0 ? n : null); };
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <span style={{ flex: 1, fontSize: 12, color: "var(--di-ink-soft)" }}>{label}</span>
        <div style={{ flex: "0 0 116px", display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 10px", border: "1px solid var(--di-rule)", borderRadius: 8, background: "#0e2032" }}>
          {prefix && <span style={{ fontSize: 12, color: "#6f8296" }}>{prefix}</span>}
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()} onBlur={() => draft && commit()}
            placeholder={value !== null ? String(value) : "no limit"} aria-label={label}
            className="di-mono" style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 12 }} />
          {unit && <span style={{ fontSize: 11, color: "#6f8296" }}>{unit}</span>}
        </div>
        {value !== null && (
          <button className="di-btn" onClick={() => { onSet(null); setDraft(""); }} aria-label={`Clear ${label}`}
            style={{ flex: "0 0 auto", border: 0, background: "transparent", cursor: "pointer", padding: 2, display: "flex" }}>
            <Icon name="x" size={13} color="var(--di-ink-mute)" />
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "#6f8296", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

/** The design uses a real switch, not a checkbox — read-only is a state you
 *  flip, not a form field you tick. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="di-btn" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flex: "0 0 auto", width: 40, height: 22, borderRadius: 999, border: 0, cursor: "pointer", padding: 2,
        background: on ? "var(--di-info)" : "#24384f", display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: on ? "#062420" : "#8fa6b5", display: "block" }} />
    </button>
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
