import { useState } from "react";
import type { RepoRef } from "../../api";
import { Icon, RailTitle } from "../primitives";
import { RailDock, MainColumn } from "../Shell";
import type { SAMPLE, Move } from "../control";
import type { Change, Hunk, SessionState, Verdict } from "../state";

export function ChangesScreen({
  s, activeDiff, loading, repos, syncing, onSelect, onVerdict, onReviewed, onCommitSync,
}: {
  s: SessionState;
  /** Checkouts in the session, primary first — the rail lists a branch per
   *  repo, because one pill cannot speak for four branches (44f). */
  repos: RepoRef[];
  /** Per-repo sync state while a Commit & sync is in flight. */
  syncing: Record<string, "pushing" | "waiting" | "done" | "failed"> | null;
  activeDiff: { path: string; repo?: string; hunks: Hunk[]; moves: Move[]; truncated: boolean; binary: boolean } | null;
  sample: typeof SAMPLE;
  loading?: boolean;
  onSelect: (path: string, repo?: string) => void;
  onVerdict: (path: string, hunk: number, v: Verdict) => void;
  onReviewed: (path: string, repo?: string) => void;
  onCommitSync: () => void;
}) {
  const clean = !loading && s.changes.length === 0;
  const needsYou = s.changes.filter((c) => c.needsYou);
  const awaiting = s.changes.filter((c) => !c.needsYou);
  const staged = s.changes.filter((c) => !c.needsYou).length;
  // A change is identified by (checkout, path): two repos in one session can
  // both have a `src/index.ts`, and only one of them is the open diff.
  const isActive = (c: Change) => !!activeDiff && activeDiff.path === c.path && activeDiff.repo === c.repo;
  const totals = activeDiff
    ? activeDiff.hunks.reduce((a, h) => {
        for (const l of h.lines) { if (l.kind === "add") a.add++; else if (l.kind === "del") a.del++; }
        return a;
      }, { add: 0, del: 0 })
    : null;

  return (
    <>
      <RailTitle style={{ position: "absolute", top: 52, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>Changes</RailTitle>

      <BranchRail s={s} repos={repos} changes={s.changes}
        onRefresh={() => activeDiff && onSelect(activeDiff.path, activeDiff.repo)} />

      <div className="di-scroll" style={{ position: "absolute", top: 122, left: 0, width: 340, bottom: 110, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        {needsYou.length > 0 && <div className="di-eyebrow" style={{ color: "var(--di-spot)", padding: "2px 2px 8px" }}>Needs you · {needsYou.length}</div>}
        {needsYou.map((c) => <ChangeRow key={rowKey(c)} c={c} spotColor="var(--di-spot)" active={isActive(c)} onSelect={onSelect} onReviewed={onReviewed} />)}
        <div className="di-eyebrow" style={{ color: "var(--di-rail-hue)", padding: "10px 2px 8px" }}>Awaiting · {awaiting.length}</div>
        {awaiting.length === 0 && <div style={{ fontSize: 11.5, color: "var(--di-ink-mute)", padding: "4px 2px" }}>No pending changes.</div>}
        {awaiting.map((c) => <ChangeRow key={rowKey(c)} c={c} spotColor="var(--di-rail-hue)" active={isActive(c)} onSelect={onSelect} onReviewed={onReviewed} />)}
      </div>

      <CommitDock staged={staged} changes={s.changes} repos={repos} syncing={syncing} onCommitSync={onCommitSync} />

      {/* ── main: diff ── */}
      <MainColumn style={{ background: "var(--di-canvas)" }}>
        {totals && (
          <div style={{ position: "absolute", top: 14, right: 16, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 9, height: 26, padding: "0 12px", borderRadius: 999, background: "#141d33", border: "1px solid var(--di-rail-row-border)" }} className="di-mono">
            <span style={{ fontSize: 11, color: "var(--di-pos)" }}>+{totals.add}</span>
            <span style={{ fontSize: 11, color: "var(--di-neg)" }}>−{totals.del}</span>
          </div>
        )}
        {activeDiff && (
          <div style={{ position: "absolute", top: 15, left: 20, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--di-ink-mute)" }}>
            <Icon name="git-compare" size={11} color="var(--di-info)" />
            {activeDiff.truncated ? "line diff · file too large for spans" : "span diff · token-level"}
          </div>
        )}

        {loading ? (
          <div style={{ position: "absolute", top: 60, left: 24, right: 24 }}>
            {[40, 92, 86, 70, 30, 88, 64].map((w, i) => <div key={i} style={{ width: `${w}%`, height: 12, borderRadius: 6, background: "#12283f", opacity: 0.6, animation: "di-pulse 1.6s infinite", marginBottom: i === 4 ? 26 : 12 }} />)}
          </div>
        ) : clean ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
            <div style={{ maxWidth: 420, textAlign: "center" }}>
              <div style={{ width: 60, height: 60, margin: "0 auto 18px", borderRadius: 15, background: "#0e2233", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check-check" size={27} color="var(--di-info)" /></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em", marginBottom: 8 }}>Nothing to review</div>
              <div style={{ fontSize: 13, color: "var(--di-ink-mute)", lineHeight: 1.55 }}>The working tree matches HEAD. When Claude edits files, they queue here for you to keep, revert, or tighten.</div>
            </div>
          </div>
        ) : !activeDiff ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
            <div style={{ maxWidth: 420, textAlign: "center" }}>
              <div style={{ width: 60, height: 60, margin: "0 auto 18px", borderRadius: 15, background: "#0e2233", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="mouse-pointer-click" size={27} color="var(--di-info)" /></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em", marginBottom: 8 }}>Select a file to review</div>
              <div style={{ fontSize: 13, color: "var(--di-ink-mute)", lineHeight: 1.55 }}>Pick a change from the list to read its diff, then keep, revert, or ask Claude to tighten it.</div>
            </div>
          </div>
        ) : (
          <div className="di-scroll di-mono" style={{ flex: 1, fontSize: 12.5, lineHeight: 1.8, padding: "46px 0 20px" }}>
            {activeDiff.moves.length > 0 && <MoveBlock moves={activeDiff.moves} />}
            {activeDiff.hunks.length === 0 && activeDiff.moves.length === 0 && <div style={{ padding: "0 20px", color: "var(--di-ink-mute)" }}>No textual diff (new, binary, or unchanged).</div>}
            {activeDiff.hunks.map((h, i) => <HunkView key={i} h={h} onVerdict={(v) => onVerdict(activeDiff.path, i, v)} />)}
          </div>
        )}
      </MainColumn>
    </>
  );
}

const rowKey = (c: Change) => `${c.repo ?? ""}\u0000${c.path}`;

function ChangeRow({ c, spotColor, active, onSelect, onReviewed }: { c: Change; spotColor: string; active: boolean; onSelect: (p: string, repo?: string) => void; onReviewed: (p: string, repo?: string) => void }) {
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
    <div className="di-row di-btn" onClick={() => !isApproval && onSelect(c.path, c.repo)}
      style={{ position: "relative", display: "flex", gap: 9, alignItems: "center", padding: "9px 11px 9px 13px", borderRadius: 9, background: bg, border, marginBottom: 5, cursor: isApproval ? "default" : "pointer", overflow: "hidden" }}>
      {showSpot && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: spotColor }} />}
      {isApproval ? (
        <Icon name="terminal" size={13} color="var(--di-warn)" />
      ) : (
        <span className="di-mono" style={{ width: 15, height: 15, flex: "0 0 auto", borderRadius: 4, background: chip.bg, color: chip.fg, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.status}</span>
      )}
      <span className="di-mono" style={{ fontSize: 11, color: c.needsYou || active ? "var(--di-ink)" : "var(--di-ink-soft)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: c.reviewed ? "line-through" : "none", opacity: c.reviewed ? 0.6 : 1 }}>
        {/* The prefix reads as PROVENANCE, not part of the filename — hence
            ink-faint against ink rather than a second colour (44f). */}
        {c.repo && <span style={{ color: "#5a6b7d" }}>{c.repo}/</span>}{c.path}
      </span>
      {!isApproval && (
        <button className="di-btn" onClick={(e) => { e.stopPropagation(); onReviewed(c.path, c.repo); }} aria-label="Mark reviewed" title="Mark reviewed"
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

/** Moved runs — the flagship: reported once here, not as +N/−N noise in the hunks. */
function MoveBlock({ moves }: { moves: Move[] }) {
  return (
    <div style={{ margin: "0 20px 18px", border: "1px solid var(--di-rule)", borderRadius: 10, background: "#101d2e", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--di-surface-sunken)", color: "var(--di-info)", fontSize: 11, letterSpacing: ".03em" }}>
        <Icon name="move" size={13} color="var(--di-info)" />
        Moved · {moves.length} block{moves.length === 1 ? "" : "s"}
      </div>
      {moves.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 12px", borderTop: "1px solid var(--di-rule)" }}>
          <span style={{ flex: "0 0 auto", fontSize: 10, color: "var(--di-ink-mute)" }}>→ line {m.toLine}{m.count > 1 ? ` (+${m.count - 1})` : ""}</span>
          <span style={{ color: "var(--di-ink-soft)", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>{m.text}</span>
        </div>
      ))}
    </div>
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


/** Which checkout a change belongs to, as the `?repo=` handle. Undefined is
 *  the primary — the same convention the API uses. */
const repoOf = (c: Change, repos: RepoRef[]) => c.repo ?? repos[0]?.name;

/**
 * The rail's branch header (44f).
 *
 * With one repo this is the single branch pill it always was. With several it
 * becomes a list — every branch with its own change count — because one pill
 * cannot speak for four branches, and a clean repo saying "clean" is part of
 * the answer.
 */
function BranchRail({ s, repos, changes, onRefresh }: {
  s: SessionState; repos: RepoRef[]; changes: Change[]; onRefresh: () => void;
}) {
  const multi = repos.length > 1;
  const counts = new Map<string, number>();
  for (const c of changes) {
    if (c.kind === "approval") continue;
    const k = repoOf(c, repos) ?? "";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return (
    <div style={{ position: "absolute", top: 78, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
      {!multi ? (
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 11px", border: "1px solid var(--di-rail-row-border)", borderRadius: 9, background: "var(--di-rail-row-bg)", minWidth: 0 }}>
            <Icon name="git-branch" size={13} color="var(--di-rail-hue)" />
            <span className="di-mono" style={{ fontSize: 10.5, color: "var(--di-ink)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.branch}</span>
            {s.ahead > 0 && <span className="di-mono" style={{ fontSize: 10, color: "var(--di-pos)", flex: "0 0 auto" }}>↑{s.ahead}</span>}
          </div>
          <RefreshBtn onRefresh={onRefresh} />
        </div>
      ) : (
        <>
          <div className="di-eyebrow" style={{ fontSize: 9, padding: "0 2px 7px", display: "flex", alignItems: "center" }}>
            Branches
            <span style={{ marginLeft: "auto" }}><RefreshBtn onRefresh={onRefresh} small /></span>
          </div>
          {repos.map((r, i) => {
            const n = counts.get(r.name) ?? 0;
            return (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, height: 31, padding: "0 10px", marginBottom: 4, borderRadius: 8,
                border: `1px solid ${n ? "var(--di-rail-row-border)" : "transparent"}`, background: n ? "var(--di-rail-row-bg)" : "transparent", minWidth: 0 }}>
                <Icon name={i === 0 ? "square-terminal" : "git-branch"} size={12} color={n ? "var(--di-rail-hue)" : "#3e5670"} />
                <span className="di-mono" style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: n ? "var(--di-ink)" : "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name} · {r.branch ?? "default"}
                </span>
                <span className="di-mono" style={{ flex: "0 0 auto", fontSize: 10, color: n ? "var(--di-rail-hue)" : "#3e5670" }}>{n || "clean"}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function RefreshBtn({ onRefresh, small }: { onRefresh: () => void; small?: boolean }) {
  const d = small ? 20 : 34;
  return (
    <button className="di-btn" aria-label="Refresh" onClick={onRefresh}
      style={{ flex: "0 0 auto", width: d, height: d, border: small ? 0 : "1px solid var(--di-rail-row-border)", borderRadius: small ? 6 : 9, background: small ? "transparent" : "var(--di-rail-row-bg)", color: "var(--di-rail-hue)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name="refresh-cw" size={small ? 12 : 14} />
    </button>
  );
}

/**
 * Commit & sync (44f).
 *
 * The button used to give no indication it was about to touch three
 * repositories. It now carries the count in its label and expands a pre-flight
 * listing each repo, its file count and its state — with the sequential rule
 * stated, because "one repo at a time, and the failure names the repo" is the
 * thing a reviewer needs to know before pressing it.
 */
function CommitDock({ staged, changes, repos, syncing, onCommitSync }: {
  staged: number; changes: Change[]; repos: RepoRef[];
  syncing: Record<string, "pushing" | "waiting" | "done" | "failed"> | null;
  onCommitSync: () => void;
}) {
  const [open, setOpen] = useState(false);
  const perRepo = repos
    .map((r) => ({ r, n: changes.filter((c) => c.kind !== "approval" && repoOf(c, repos) === r.name).length }))
    .filter((x) => x.n > 0);
  const multi = perRepo.length > 1;
  const busy = !!syncing;

  return (
    <RailDock style={{ padding: "12px 14px 13px" }}>
      {(open || busy) && multi && (
        <div style={{ border: "1px solid #5a3316", borderRadius: 11, background: "#160f0a", padding: "10px 11px", marginBottom: 9 }}>
          <div className="di-eyebrow" style={{ fontSize: 9, color: "var(--di-spot)", marginBottom: 8 }}>
            This will touch {perRepo.length} repositories
          </div>
          {perRepo.map(({ r, n }) => {
            const st = syncing?.[r.name];
            return (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ flex: "0 0 auto", width: 13, display: "flex", justifyContent: "center" }}>
                  {st === "pushing"
                    ? <span style={{ width: 9, height: 9, borderRadius: 999, border: "2px solid var(--di-info)", borderTopColor: "transparent", display: "block", animation: "di-spin .8s linear infinite" }} />
                    : st === "done" ? <Icon name="check" size={11} color="var(--di-pos)" />
                    : st === "failed" ? <Icon name="alert-triangle" size={11} color="var(--di-neg)" />
                    : null}
                </span>
                <span className="di-mono" style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--di-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                <span className="di-mono" style={{ flex: "0 0 auto", fontSize: 10, color: st === "failed" ? "var(--di-neg)" : "#a08a5e" }}>
                  {n} file{n === 1 ? "" : "s"}{st ? ` · ${st}` : ""}
                </span>
              </div>
            );
          })}
          <div style={{ fontSize: 10.5, color: "#a08a5e", lineHeight: 1.45, marginTop: 7 }}>
            One repo at a time. If one fails the rest stop, and the failure names the repo.
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <RailTitle>Commit · {staged} change{staged === 1 ? "" : "s"}</RailTitle>
        {multi && !busy && (
          <button className="di-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            style={{ border: 0, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 10.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {open ? "Hide" : "What will run"}<Icon name={open ? "chevron-up" : "chevron-down"} size={11} />
          </button>
        )}
      </div>
      <button className="di-btn" onClick={onCommitSync} disabled={busy}
        style={{ width: "100%", height: 38, border: 0, borderRadius: 10, background: "var(--di-cta)", color: "#3a140a", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.65 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon name="git-commit-horizontal" size={15} color="#3a140a" />
        {busy ? "Syncing…" : `Commit & sync${multi ? ` · ${perRepo.length} repos` : ""}`}
      </button>
    </RailDock>
  );
}
