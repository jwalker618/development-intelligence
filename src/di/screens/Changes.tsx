import { Icon, RailTitle } from "../primitives";
import { RailDock, MainColumn } from "../Shell";
import type { Change, Hunk, SessionState, Verdict } from "../state";

export function ChangesScreen({
  s, onVerdict,
}: {
  s: SessionState;
  onVerdict: (path: string, hunk: number, v: Verdict) => void;
}) {
  const needsYou = s.changes.filter((c) => c.needsYou);
  const awaiting = s.changes.filter((c) => !c.needsYou);
  const staged = s.changes.filter((c) => c.reviewed).length || 3;
  const active = s.changes.find((c) => c.hunks?.length);
  const totals = active ? { add: active.add, del: active.del, moves: active.moved ? 1 : 0 } : { add: 48, del: 12, moves: 1 };

  return (
    <>
      {/* ── rail ── */}
      <RailTitle style={{ position: "absolute", top: 52, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        Changes
      </RailTitle>

      {/* branch header */}
      <div style={{ position: "absolute", top: 78, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5, display: "flex", gap: 6 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 11px",
          border: "1px solid var(--di-rail-row-border)", borderRadius: 9, background: "var(--di-rail-row-bg)", minWidth: 0 }}>
          <Icon name="git-branch" size={13} color="var(--di-rail-hue)" />
          <span className="di-mono" style={{ fontSize: 10.5, color: "var(--di-ink)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.branch}</span>
          <span className="di-mono" style={{ fontSize: 10, color: "var(--di-pos)", flex: "0 0 auto" }}>↑{s.ahead}</span>
        </div>
        <button className="di-btn" aria-label="Refresh" style={{ flex: "0 0 auto", width: 34, height: 34, border: "1px solid var(--di-rail-row-border)",
          borderRadius: 9, background: "var(--di-rail-row-bg)", color: "var(--di-rail-hue)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="refresh-cw" size={14} />
        </button>
      </div>

      {/* change list */}
      <div className="di-scroll" style={{ position: "absolute", top: 122, left: 0, width: 340, bottom: 110, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        <div className="di-eyebrow" style={{ color: "var(--di-spot)", padding: "2px 2px 8px" }}>Needs you · {needsYou.length}</div>
        {needsYou.map((c) => <ChangeRow key={c.path} c={c} spotColor="var(--di-spot)" />)}
        <div className="di-eyebrow" style={{ color: "var(--di-rail-hue)", padding: "10px 2px 8px" }}>Awaiting · {awaiting.length}</div>
        {awaiting.map((c, i) => <ChangeRow key={c.path} c={c} spotColor="var(--di-rail-hue)" active={i === 0} />)}
      </div>

      {/* commit dock */}
      <RailDock style={{ padding: "12px 14px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <RailTitle>Commit · {staged} staged</RailTitle>
        </div>
        <button className="di-btn" style={{ width: "100%", height: 38, border: 0, borderRadius: 10, background: "var(--di-cta)",
          color: "#3a140a", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="git-commit-horizontal" size={15} color="#3a140a" />Commit &amp; sync
        </button>
      </RailDock>

      {/* ── main: semantic diff, verdicts on the hunk ── */}
      <MainColumn style={{ background: "var(--di-canvas)" }}>
        <div style={{ position: "absolute", top: 14, right: 16, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 9, height: 26,
          padding: "0 12px", borderRadius: 999, background: "#141d33", border: "1px solid var(--di-rail-row-border)" }} className="di-mono">
          <span style={{ fontSize: 11, color: "var(--di-pos)" }}>+{totals.add}</span>
          <span style={{ fontSize: 11, color: "var(--di-neg)" }}>−{totals.del}</span>
          {totals.moves > 0 && <span style={{ fontSize: 11, color: "var(--di-rail-hue)" }}>· {totals.moves} move</span>}
        </div>

        <div className="di-scroll di-mono" style={{ flex: 1, fontSize: 12.5, lineHeight: 1.8, padding: "46px 0 20px" }}>
          {active?.hunks?.map((h, i) => (
            <HunkView key={i} h={h} onVerdict={(v) => onVerdict(active.path, i, v)} />
          ))}
          {/* first-class move block (LCS-detected, collapsed) */}
          <div style={{ margin: "16px 20px", border: "1px solid #6a4a1a", borderRadius: 12, background: "#241a0e", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", borderBottom: "1px dashed #6a4a1a" }}>
              <Icon name="move" size={15} color="var(--di-warn)" />
              <span style={{ color: "var(--di-warn)", fontWeight: 600, fontSize: 12.5 }}>6 lines moved, unchanged</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--di-ink-mute)", fontSize: 11 }}>→ ReviewRow.tsx:8</span>
            </div>
            <div style={{ padding: "9px 13px", color: "var(--di-ink-mute)", fontSize: 11.5, lineHeight: 1.75 }}>
              <div style={{ whiteSpace: "pre" }}>  const cost = estimateTokens(row);</div>
              <div style={{ whiteSpace: "pre", color: "#6f8296" }}>  … 5 more identical lines</div>
            </div>
          </div>
        </div>
      </MainColumn>
    </>
  );
}

function ChangeRow({ c, spotColor, active }: { c: Change; spotColor: string; active?: boolean }) {
  const isApproval = c.kind === "approval";
  const bg = c.needsYou ? "var(--di-rail-row-bg)" : active ? "#122a20" : "transparent";
  const border = c.needsYou ? "1px solid var(--di-rail-row-border)" : "1px solid transparent";
  const showSpot = c.needsYou || active;
  const statusChipColors: Record<string, { bg: string; fg: string }> = {
    M: c.needsYou ? { bg: "#3b2911", fg: "var(--di-warn)" } : { bg: "var(--di-info-soft)", fg: "var(--di-info)" },
    A: { bg: "var(--di-pos-soft)", fg: "var(--di-pos)" },
    D: { bg: "var(--di-neg-soft)", fg: "var(--di-neg)" },
  };
  const chip = statusChipColors[c.status];
  return (
    <div className="di-row di-btn" style={{ position: "relative", display: "flex", gap: 9, alignItems: "center",
      padding: "9px 11px 9px 13px", borderRadius: 9, background: bg, border, marginBottom: 5, cursor: "pointer", overflow: "hidden" }}>
      {showSpot && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: spotColor }} />}
      {isApproval ? (
        <Icon name="terminal" size={13} color="var(--di-warn)" />
      ) : (
        <span className="di-mono" style={{ width: 15, height: 15, flex: "0 0 auto", borderRadius: 4, background: chip.bg, color: chip.fg,
          fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.status}</span>
      )}
      <span className="di-mono" style={{ fontSize: 11, color: c.needsYou || active ? "var(--di-ink)" : "var(--di-ink-soft)", flex: 1, minWidth: 0,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.path}</span>
      {!isApproval && c.add > 0 && <span className="di-mono" style={{ fontSize: 9, color: "var(--di-pos)" }}>+{c.add}</span>}
    </div>
  );
}

function HunkView({ h, onVerdict }: { h: Hunk; onVerdict: (v: Verdict) => void }) {
  return (
    <>
      <div style={{ display: "flex", padding: "6px 20px", background: "var(--di-surface-sunken)", color: "var(--di-info)" }}>
        <span style={{ width: 60, flex: "0 0 auto", color: "var(--di-rule-strong)" }} />
        <span>{h.header}</span>
      </div>
      {h.lines.map((ln, i) => {
        if (ln.kind === "add") {
          return (
            <div key={i} style={{ display: "flex", background: "#12331f", borderLeft: "2px solid var(--di-pos)" }}>
              <Gutter n={ln.no} />
              <span style={{ whiteSpace: "pre", color: "#a9f0b6" }}>{ln.text}</span>
            </div>
          );
        }
        if (ln.kind === "replace") {
          return (
            <div key={i} style={{ display: "flex", background: "#12283f", borderLeft: "2px solid var(--di-info)" }}>
              <Gutter n={ln.no} />
              <span style={{ whiteSpace: "pre", color: "var(--di-ink-soft)" }}>
                {ln.ops?.map((op, j) => {
                  if (op.kind === "equal") return <span key={j}>{op.text}</span>;
                  if (op.kind === "delete") return <span key={j} style={{ background: "var(--di-neg-soft)", color: "#ffb3b3", textDecoration: "line-through", textDecorationColor: "var(--di-neg)", borderRadius: 3, padding: "0 3px" }}>{op.oldText}</span>;
                  if (op.kind === "insert") return <span key={j} style={{ background: "#12331f", color: "#a9f0b6", borderRadius: 3, padding: "0 3px", marginLeft: 4 }}>{op.newText}</span>;
                  return null;
                })}
              </span>
            </div>
          );
        }
        return (
          <div key={i} style={{ display: "flex" }}>
            <Gutter n={ln.no} />
            <span style={{ color: "var(--di-ink-soft)", whiteSpace: "pre" }}>{ln.text}</span>
          </div>
        );
      })}
      {/* per-hunk verdict row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px 12px 60px" }}>
        <span style={{ fontSize: 10.5, color: "var(--di-ink-mute)", letterSpacing: ".04em" }}>this hunk —</span>
        <VerdictBtn active={h.verdict === "keep"} onClick={() => onVerdict("keep")} icon="check" label="Keep"
          style={{ background: h.verdict === "keep" ? "#1f8a5b" : "#155a3c", color: "#eafff1", border: 0 }} />
        <VerdictBtn active={h.verdict === "revert"} onClick={() => onVerdict("revert")} icon="undo-2" label="Revert"
          style={{ background: h.verdict === "revert" ? "#4a2020" : "transparent", color: "var(--di-neg)", border: "1px solid #4a2020" }} />
        <VerdictBtn active={h.verdict === "tighten"} onClick={() => onVerdict("tighten")} icon="sparkles" label="Tighten"
          style={{ background: h.verdict === "tighten" ? "var(--di-rail-hue)" : "var(--di-rail-row-bg)",
            color: h.verdict === "tighten" ? "#0a1420" : "var(--di-rail-title)", border: "1px solid var(--di-rail-row-border)" }} />
      </div>
    </>
  );
}

function Gutter({ n }: { n: number | null }) {
  return <span style={{ width: 60, flex: "0 0 auto", textAlign: "right", paddingRight: 14, color: "var(--di-rule-strong)" }}>{n ?? ""}</span>;
}

function VerdictBtn({ icon, label, onClick, style }: { icon: string; label: string; active: boolean; onClick: () => void; style: React.CSSProperties }) {
  return (
    <button className="di-btn" onClick={onClick} style={{ height: 30, padding: "0 12px", borderRadius: 8, fontFamily: "inherit",
      fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      <Icon name={icon} size={13} />{label}
    </button>
  );
}
