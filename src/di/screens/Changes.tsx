import { Icon, RailTitle } from "../primitives";
import { RailDock, MainColumn } from "../Shell";
import { SampleChip } from "./Session";
import type { SAMPLE } from "../control";
import type { Change, Hunk, SessionState, Verdict } from "../state";

export function ChangesScreen({
  s, activeDiff, sample, onSelect, onVerdict, onReviewed, onCommitSync,
}: {
  s: SessionState;
  activeDiff: { path: string; hunks: Hunk[] } | null;
  sample: typeof SAMPLE;
  onSelect: (path: string) => void;
  onVerdict: (path: string, hunk: number, v: Verdict) => void;
  onReviewed: (path: string) => void;
  onCommitSync: () => void;
}) {
  const needsYou = s.changes.filter((c) => c.needsYou);
  const awaiting = s.changes.filter((c) => !c.needsYou);
  const staged = s.changes.filter((c) => !c.needsYou).length;
  const activePath = activeDiff?.path ?? null;
  const totals = activeDiff
    ? activeDiff.hunks.reduce((a, h) => {
        for (const l of h.lines) { if (l.kind === "add") a.add++; else if (l.kind === "del") a.del++; }
        return a;
      }, { add: 0, del: 0 })
    : null;

  return (
    <>
      <RailTitle style={{ position: "absolute", top: 52, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>Changes</RailTitle>

      <div style={{ position: "absolute", top: 78, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5, display: "flex", gap: 6 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 11px", border: "1px solid var(--di-rail-row-border)", borderRadius: 9, background: "var(--di-rail-row-bg)", minWidth: 0 }}>
          <Icon name="git-branch" size={13} color="var(--di-rail-hue)" />
          <span className="di-mono" style={{ fontSize: 10.5, color: "var(--di-ink)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.branch}</span>
          {s.ahead > 0 && <span className="di-mono" style={{ fontSize: 10, color: "var(--di-pos)", flex: "0 0 auto" }}>↑{s.ahead}</span>}
        </div>
        <button className="di-btn" aria-label="Refresh" onClick={() => activePath && onSelect(activePath)} style={{ flex: "0 0 auto", width: 34, height: 34, border: "1px solid var(--di-rail-row-border)", borderRadius: 9, background: "var(--di-rail-row-bg)", color: "var(--di-rail-hue)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="refresh-cw" size={14} />
        </button>
      </div>

      <div className="di-scroll" style={{ position: "absolute", top: 122, left: 0, width: 340, bottom: 110, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        {needsYou.length > 0 && <div className="di-eyebrow" style={{ color: "var(--di-spot)", padding: "2px 2px 8px" }}>Needs you · {needsYou.length}</div>}
        {needsYou.map((c) => <ChangeRow key={c.path} c={c} spotColor="var(--di-spot)" active={c.path === activePath} onSelect={onSelect} onReviewed={onReviewed} />)}
        <div className="di-eyebrow" style={{ color: "var(--di-rail-hue)", padding: "10px 2px 8px" }}>Awaiting · {awaiting.length}</div>
        {awaiting.length === 0 && <div style={{ fontSize: 11.5, color: "var(--di-ink-mute)", padding: "4px 2px" }}>No pending changes.</div>}
        {awaiting.map((c) => <ChangeRow key={c.path} c={c} spotColor="var(--di-rail-hue)" active={c.path === activePath} onSelect={onSelect} onReviewed={onReviewed} />)}
      </div>

      <RailDock style={{ padding: "12px 14px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <RailTitle>Commit · {staged} change{staged === 1 ? "" : "s"}</RailTitle>
        </div>
        <button className="di-btn" onClick={onCommitSync} style={{ width: "100%", height: 38, border: 0, borderRadius: 10, background: "var(--di-cta)", color: "#3a140a", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="git-commit-horizontal" size={15} color="#3a140a" />Commit &amp; sync
        </button>
      </RailDock>

      {/* ── main: diff ── */}
      <MainColumn style={{ background: "var(--di-canvas)" }}>
        {totals && (
          <div style={{ position: "absolute", top: 14, right: 16, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 9, height: 26, padding: "0 12px", borderRadius: 999, background: "#141d33", border: "1px solid var(--di-rail-row-border)" }} className="di-mono">
            <span style={{ fontSize: 11, color: "var(--di-pos)" }}>+{totals.add}</span>
            <span style={{ fontSize: 11, color: "var(--di-neg)" }}>−{totals.del}</span>
          </div>
        )}
        {sample.semanticDiff && activeDiff && (
          <div style={{ position: "absolute", top: 15, left: 20, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--di-ink-mute)" }}>
            line diff <SampleChip /> <span style={{ color: "#4d6076" }}>span engine not wired</span>
          </div>
        )}

        {!activeDiff ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--di-ink-mute)", fontSize: 13, gap: 8 }}>
            <Icon name="git-compare" size={16} />Select a change to review its diff.
          </div>
        ) : (
          <div className="di-scroll di-mono" style={{ flex: 1, fontSize: 12.5, lineHeight: 1.8, padding: "46px 0 20px" }}>
            {activeDiff.hunks.length === 0 && <div style={{ padding: "0 20px", color: "var(--di-ink-mute)" }}>No textual diff (new, binary, or unchanged).</div>}
            {activeDiff.hunks.map((h, i) => <HunkView key={i} h={h} onVerdict={(v) => onVerdict(activeDiff.path, i, v)} />)}
          </div>
        )}
      </MainColumn>
    </>
  );
}

function ChangeRow({ c, spotColor, active, onSelect, onReviewed }: { c: Change; spotColor: string; active: boolean; onSelect: (p: string) => void; onReviewed: (p: string) => void }) {
  const isApproval = c.kind === "approval";
  const bg = c.needsYou ? "var(--di-rail-row-bg)" : active ? "#122a20" : "transparent";
  const border = c.needsYou ? "1px solid var(--di-rail-row-border)" : "1px solid transparent";
  const showSpot = c.needsYou || active;
  const chipColors: Record<string, { bg: string; fg: string }> = {
    M: c.needsYou ? { bg: "#3b2911", fg: "var(--di-warn)" } : { bg: "var(--di-info-soft)", fg: "var(--di-info)" },
    A: { bg: "var(--di-pos-soft)", fg: "var(--di-pos)" },
    D: { bg: "var(--di-neg-soft)", fg: "var(--di-neg)" },
  };
  const chip = chipColors[c.status];
  return (
    <div className="di-row di-btn" onClick={() => !isApproval && onSelect(c.path)}
      style={{ position: "relative", display: "flex", gap: 9, alignItems: "center", padding: "9px 11px 9px 13px", borderRadius: 9, background: bg, border, marginBottom: 5, cursor: isApproval ? "default" : "pointer", overflow: "hidden" }}>
      {showSpot && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: spotColor }} />}
      {isApproval ? (
        <Icon name="terminal" size={13} color="var(--di-warn)" />
      ) : (
        <span className="di-mono" style={{ width: 15, height: 15, flex: "0 0 auto", borderRadius: 4, background: chip.bg, color: chip.fg, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.status}</span>
      )}
      <span className="di-mono" style={{ fontSize: 11, color: c.needsYou || active ? "var(--di-ink)" : "var(--di-ink-soft)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: c.reviewed ? "line-through" : "none", opacity: c.reviewed ? 0.6 : 1 }}>{c.path}</span>
      {!isApproval && (
        <button className="di-btn" onClick={(e) => { e.stopPropagation(); onReviewed(c.path); }} aria-label="Mark reviewed" title="Mark reviewed"
          style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
          <Icon name="check" size={13} color={c.reviewed ? "var(--di-pos)" : "#3e5670"} />
        </button>
      )}
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
        if (ln.kind === "add") return (
          <div key={i} style={{ display: "flex", background: "#12331f", borderLeft: "2px solid var(--di-pos)" }}>
            <Gutter n={ln.no} /><span style={{ whiteSpace: "pre", color: "#a9f0b6" }}>+{ln.text}</span>
          </div>
        );
        if (ln.kind === "del") return (
          <div key={i} style={{ display: "flex", background: "var(--di-neg-soft)", borderLeft: "2px solid var(--di-neg)" }}>
            <Gutter n={ln.no} /><span style={{ whiteSpace: "pre", color: "#ffb3b3" }}>−{ln.text}</span>
          </div>
        );
        if (ln.kind === "replace") return (
          <div key={i} style={{ display: "flex", background: "#12283f", borderLeft: "2px solid var(--di-info)" }}>
            <Gutter n={ln.no} />
            <span style={{ whiteSpace: "pre", color: "var(--di-ink-soft)" }}>
              {ln.ops?.map((op, j) => op.kind === "equal" ? <span key={j}>{op.text}</span>
                : op.kind === "delete" ? <span key={j} style={{ background: "var(--di-neg-soft)", color: "#ffb3b3", textDecoration: "line-through", textDecorationColor: "var(--di-neg)", borderRadius: 3, padding: "0 3px" }}>{op.oldText}</span>
                : op.kind === "insert" ? <span key={j} style={{ background: "#12331f", color: "#a9f0b6", borderRadius: 3, padding: "0 3px", marginLeft: 4 }}>{op.newText}</span> : null)}
            </span>
          </div>
        );
        return (
          <div key={i} style={{ display: "flex" }}>
            <Gutter n={ln.no} /><span style={{ color: "var(--di-ink-soft)", whiteSpace: "pre" }}> {ln.text}</span>
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px 12px 60px" }}>
        <span style={{ fontSize: 10.5, color: "var(--di-ink-mute)", letterSpacing: ".04em" }}>this hunk —</span>
        <VerdictBtn onClick={() => onVerdict("keep")} icon="check" label="Keep" style={{ background: h.verdict === "keep" ? "#1f8a5b" : "#155a3c", color: "#eafff1", border: 0 }} />
        <VerdictBtn onClick={() => onVerdict("revert")} icon="undo-2" label="Revert" style={{ background: h.verdict === "revert" ? "#4a2020" : "transparent", color: "var(--di-neg)", border: "1px solid #4a2020" }} />
        <VerdictBtn onClick={() => onVerdict("tighten")} icon="sparkles" label="Tighten" style={{ background: h.verdict === "tighten" ? "var(--di-rail-hue)" : "var(--di-rail-row-bg)", color: h.verdict === "tighten" ? "#0a1420" : "var(--di-rail-title)", border: "1px solid var(--di-rail-row-border)" }} />
      </div>
    </>
  );
}

function Gutter({ n }: { n: number | null }) {
  return <span style={{ width: 60, flex: "0 0 auto", textAlign: "right", paddingRight: 14, color: "var(--di-rule-strong)" }}>{n ?? ""}</span>;
}

function VerdictBtn({ icon, label, onClick, style }: { icon: string; label: string; onClick: () => void; style: React.CSSProperties }) {
  return (
    <button className="di-btn" onClick={onClick} style={{ height: 30, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      <Icon name={icon} size={13} />{label}
    </button>
  );
}
