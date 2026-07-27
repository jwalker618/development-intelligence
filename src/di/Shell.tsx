import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api, type RepoRef, type SessionInfo } from "../api";
import { Icon } from "./primitives";
import { VIEWS, THEMES, type View, type Theme } from "./state";

export interface FrameProps {
  view: View; onView: (v: View) => void;
  theme: Theme; onTheme: (t: Theme) => void;
  repoCount: number; screen: ReactNode;
  sessions: SessionInfo[]; currentSessionId: string | null;
  /** Checkouts in the CURRENT session, primary first. */
  repos: RepoRef[];
  onAddRepo: (repo: string, branch: string | null) => Promise<void>;
  onRemoveRepo: (name: string) => Promise<void>;
  onSwitchSession: (id: string) => void;
  onNewSession: () => void;
  onAllSessions: () => void;
  onSettings: () => void;
  onCloseSession: (id: string) => void;
}

/** The consistent frame: coral flush-nav (opens the 37f dropdown), 340px theme
 *  rail base layer, main working area. */
export function Frame(p: FrameProps) {
  const [menu, setMenu] = useState(false);
  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "var(--di-canvas)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 340, background: "var(--di-rail-bg)", borderRight: "1px solid var(--di-rail-border)", zIndex: 2 }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: 340, height: 3, background: "var(--di-rail-accent)", zIndex: 5 }} />

      {p.screen}

      {/* Flush nav button — glyph reflects open state (out-down-right ↔ up-left) */}
      <button
        className="di-nav di-btn" data-open={menu || undefined}
        onClick={() => setMenu((m) => !m)} aria-label="Navigation" aria-expanded={menu}
        style={{ position: "absolute", top: 0, left: 0, zIndex: 8, display: "flex", alignItems: "center", gap: 9,
          height: 42, padding: "0 15px", border: 0, borderRadius: "14px 0 12px 0", background: "var(--di-nav-bg)", cursor: "pointer" }}
      >
        <Icon name={menu ? "arrow-up-left" : "square-arrow-out-down-right"} size={18} color="#3a140a" />
        <span style={{ width: 1, height: 15, background: "#c26a48" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="folder-git-2" size={12} color="#5a2412" />
          <span className="di-mono" style={{ fontSize: 12, fontWeight: 700, color: "#3a140a" }}>{p.repoCount}</span>
        </span>
      </button>
      {menu && <NavDropdown p={p} onClose={() => setMenu(false)} />}
    </div>
  );
}

function NavDropdown({ p, onClose }: { p: FrameProps; onClose: () => void }) {
  const [appearance, setAppearance] = useState(false);
  const act = (fn: () => void) => { fn(); onClose(); };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 20, background: "rgba(4,10,18,.35)" }} />
      <div className="di-menu" style={{ position: "absolute", top: 52, left: 14, width: 320, zIndex: 21, border: "1px solid #2c5075", borderRadius: 14, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", overflow: "hidden" }}>
        {/* sessions */}
        <div style={{ padding: "11px 13px 5px" }}>
          <div className="di-eyebrow" style={{ padding: "4px 4px 8px", fontSize: 9 }}>Sessions</div>
          {p.sessions.map((s) => {
            const current = s.id === p.currentSessionId;
            const dot = s.needsYou ? "var(--di-spot)" : s.ptyLive ? "var(--di-info)" : "#33475c";
            return (
              <button key={s.id} className="di-qrow di-btn" onClick={() => act(() => p.onSwitchSession(s.id))}
                style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 9, marginBottom: 3, cursor: "pointer",
                  background: current ? "#12283f" : "transparent", border: `1px solid ${current ? "#2c5075" : "transparent"}` }}>
                <span style={{ width: 7, height: 7, flex: "0 0 auto", borderRadius: 999, background: dot, animation: s.ptyLive && !s.needsYou ? "di-pulse 2s infinite" : undefined }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="di-mono" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--di-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.repo.split("/").pop()}</span>
                  <span style={{ display: "block", fontSize: 10, color: current ? "#a9bccf" : "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(s.branch ?? "—")}{current ? " · this session" : s.needsYou ? " · needs you" : s.ptyLive ? " · working now" : ""}</span>
                </span>
                {current
                  ? <span role="button" tabIndex={0} className="di-btn" onClick={(e) => { e.stopPropagation(); act(() => p.onCloseSession(s.id)); }} aria-label="Close session" title="Close session" style={{ display: "flex", cursor: "pointer" }}><Icon name="x" size={13} color="var(--di-ink-mute)" /></span>
                  : <Icon name="chevron-right" size={13} color="#3e5670" />}
              </button>
            );
          })}
          <button className="di-btn" onClick={() => act(p.onNewSession)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 11px", borderRadius: 9, marginTop: 2, border: 0, background: "transparent", cursor: "pointer" }}>
            <Icon name="plus" size={14} color="var(--di-info)" /><span style={{ fontSize: 12, color: "var(--di-info)", flex: 1, textAlign: "left" }}>New session</span><span style={{ fontSize: 10, color: "#6f8296" }}>⌘N</span>
          </button>
        </div>

        {/* repos in this session */}
        <ReposSection p={p} />

        {/* views */}
        <div style={{ padding: "9px 13px", borderTop: "1px solid #17293a" }}>
          <div className="di-eyebrow" style={{ padding: "2px 4px 9px", fontSize: 9 }}>This session</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
            {VIEWS.map((v) => {
              const active = v.id === p.view;
              return (
                <button key={v.id} className="di-btn" onClick={() => act(() => p.onView(v.id))}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "9px 0", borderRadius: 9, cursor: "pointer",
                    background: active ? "#1b2a3d" : "transparent", border: `1px solid ${active ? "#2c5075" : "#1a2a3a"}` }}>
                  <Icon name={v.icon} size={16} color={active ? "var(--di-spot)" : "var(--di-ink-mute)"} />
                  <span style={{ fontSize: 9.5, color: active ? "var(--di-ink)" : "var(--di-ink-mute)" }}>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "9px 11px", borderTop: "1px solid #17293a", background: "#081521" }}>
          <button className="di-btn" onClick={() => act(p.onAllSessions)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, cursor: "pointer", flex: 1, border: 0, background: "transparent" }}>
            <Icon name="folder-tree" size={14} color="var(--di-ink-mute)" /><span style={{ fontSize: 11.5, color: "var(--di-ink-soft)" }}>All sessions</span>
          </button>
          <button className="di-btn" onClick={() => act(p.onSettings)} title="Settings" style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: 0, background: "transparent" }}><Icon name="settings" size={15} color="var(--di-ink-mute)" /></button>
          <button className="di-btn" onClick={() => setAppearance((a) => !a)} title="Appearance" style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: appearance ? "1px solid #2c5075" : 0, background: appearance ? "#12283f" : "transparent" }}><Icon name="rotate-cw" size={15} color="var(--di-ink-mute)" /></button>
        </div>
        {appearance && (
          <div style={{ display: "flex", gap: 6, padding: "10px 13px", borderTop: "1px solid #17293a", background: "#081521" }}>
            {THEMES.map((t) => (
              <button key={t.id} className="di-btn" onClick={() => p.onTheme(t.id)} title={t.label}
                style={{ flex: 1, height: 30, borderRadius: 8, cursor: "pointer", border: `1px solid ${t.id === p.theme ? "var(--di-spot)" : "var(--di-rule)"}`, background: t.id === p.theme ? "#12283f" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, background: t.swatch }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Max checkouts per session — mirrors the server bound. */
const MAX_REPOS = 6;

/**
 * The session's repositories. Adding one clones it alongside the primary and
 * hands it to the agent as an extra working directory, so the next turn can
 * read and edit across both. The primary can't be removed — it is the agent's
 * cwd and the session's identity.
 */
function ReposSection({ p }: { p: FrameProps }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adding || available.length) return;
    void api.repos().then((r) => setAvailable(r.repos)).catch(() => setAvailable([]));
  }, [adding, available.length]);

  const inSession = p.repos.map((r) => r.repo);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = available.filter((r) => r.toLowerCase().includes(q) && !inSession.includes(r));
    const typed = query.trim();
    if (/^[\w.-]+\/[\w.-]+$/.test(typed) && !hits.includes(typed) && !inSession.includes(typed)) hits.unshift(typed);
    return hits.slice(0, 4);
  }, [query, available, inSession.join(",")]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await fn(); setQuery(""); setAdding(false); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  if (!p.repos.length) return null;
  return (
    <div style={{ padding: "9px 13px", borderTop: "1px solid #17293a" }}>
      <div className="di-eyebrow" style={{ padding: "2px 4px 8px", fontSize: 9 }}>
        Repositories · {p.repos.length}
      </div>
      {p.repos.map((r, i) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 8, marginBottom: 3, background: i === 0 ? "#0e2032" : "transparent", border: `1px solid ${i === 0 ? "#1d3b4f" : "transparent"}` }}>
          <Icon name="folder-git-2" size={13} color={r.status === "failed" ? "var(--di-neg)" : i === 0 ? "var(--di-spot)" : "var(--di-info)"} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="di-mono" style={{ display: "block", fontSize: 11.5, color: "var(--di-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.repo}</span>
            <span style={{ display: "block", fontSize: 9.5, color: r.status === "failed" ? "var(--di-neg)" : "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.status === "failed" ? (r.error ?? "clone failed") : `${r.branch ?? "default branch"}${i === 0 ? " · primary" : ""}`}
            </span>
          </span>
          {i > 0 && (
            <button className="di-btn" aria-label={`Remove ${r.repo}`} title="Remove from session" disabled={busy !== null}
              onClick={() => void run(r.name, () => p.onRemoveRepo(r.name))}
              style={{ border: 0, background: "transparent", cursor: busy ? "default" : "pointer", padding: 2, display: "flex", opacity: busy === r.name ? 0.4 : 1 }}>
              <Icon name="x" size={13} color="var(--di-ink-mute)" />
            </button>
          )}
        </div>
      ))}

      {error && <div style={{ fontSize: 10.5, color: "var(--di-neg)", padding: "4px 5px", lineHeight: 1.45 }}>{error}</div>}

      {p.repos.length < MAX_REPOS && (adding ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", border: "1px solid #2c5075", borderRadius: 8, background: "#0a1c2e" }}>
            <Icon name="search" size={13} color="var(--di-info)" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false}
              disabled={busy !== null}
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) void run(matches[0], () => p.onAddRepo(matches[0], null)); if (e.key === "Escape") setAdding(false); }}
              placeholder={busy ? "Cloning…" : "owner/repo"}
              className="di-mono" style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 11.5 }} />
          </div>
          {matches.map((m) => (
            <button key={m} className="di-row di-btn" disabled={busy !== null} onClick={() => void run(m, () => p.onAddRepo(m, null))}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: 0, background: "transparent", cursor: "pointer", marginTop: 2 }}>
              <Icon name="plus" size={12} color="var(--di-info)" />
              <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink-soft)", flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m}</span>
            </button>
          ))}
        </div>
      ) : (
        <button className="di-btn" onClick={() => setAdding(true)}
          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 9px", borderRadius: 8, marginTop: 2, border: 0, background: "transparent", cursor: "pointer" }}>
          <Icon name="plus" size={13} color="var(--di-info)" />
          <span style={{ fontSize: 11.5, color: "var(--di-info)", flex: 1, textAlign: "left" }}>Add repository</span>
        </button>
      ))}
    </div>
  );
}

/** Absolute scroll region inside the rail (below the 52px nav zone). */
export function RailScroll({ top = 52, bottom = 0, children, style }: { top?: number; bottom?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="di-scroll" style={{ position: "absolute", top, left: 0, width: 340, bottom, zIndex: 5, boxSizing: "border-box", padding: "0 14px 12px", ...style }}>
      {children}
    </div>
  );
}

/** Absolute bottom dock inside the rail (search / commit / raw-terminal). */
export function RailDock({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: 340, zIndex: 6, boxSizing: "border-box", padding: "12px 14px", borderTop: "1px solid var(--di-rail-border)", background: "var(--di-rail-dock-bg)", ...style }}>
      {children}
    </div>
  );
}

/** Main working area — everything right of the 340px rail, full height. */
export function MainColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", top: 0, left: 340, right: 0, bottom: 0, display: "flex", flexDirection: "column", zIndex: 3, ...style }}>{children}</div>;
}
