import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./primitives";
import { VIEWS, THEMES, type View, type Theme } from "./state";

/** The consistent frame: coral flush-nav, 340px theme rail, main working area.
 *  Screens own their rail internals (they differ) via absolute-positioned
 *  RailScroll / RailDock helpers — mirroring the design reference. */
export function Frame({
  view, onView, theme, onTheme, repoCount, screen,
}: {
  view: View; onView: (v: View) => void;
  theme: Theme; onTheme: (t: Theme) => void;
  repoCount: number; screen: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  return (
    // One positioned canvas: the rail is a base layer at left:0/width:340, the
    // main area sits at left:340 — every piece absolutely positioned, mirroring
    // the design reference's single-frame layout.
    <div style={{ position: "relative", height: "100%", width: "100%", background: "var(--di-canvas)", overflow: "hidden" }}>
      {/* rail background + top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 340, background: "var(--di-rail-bg)", borderRight: "1px solid var(--di-rail-border)", zIndex: 2 }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: 340, height: 3, background: "var(--di-rail-accent)", zIndex: 5 }} />

      {/* the active screen (positions its own rail pieces + main column) */}
      {screen}

      {/* Flush nav button — pinned to (0,0), nested into the card corner */}
      <button
        className="di-nav di-btn"
        onClick={() => setMenu((m) => !m)}
        aria-label="Switch view"
        style={{
          position: "absolute", top: 0, left: 0, zIndex: 8, display: "flex", alignItems: "center", gap: 9,
          height: 42, padding: "0 15px", border: 0, borderRadius: "14px 0 12px 0",
          background: "var(--di-nav-bg)", cursor: "pointer",
        }}
      >
        <Icon name="square-arrow-out-down-right" size={18} color="#3a140a" />
        <span style={{ width: 1, height: 15, background: "#c26a48" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="folder-git-2" size={12} color="#5a2412" />
          <span className="di-mono" style={{ fontSize: 12, fontWeight: 700, color: "#3a140a" }}>{repoCount}</span>
        </span>
      </button>
      {menu && (
        <ViewSwitcher
          view={view} theme={theme}
          onView={(v) => { onView(v); setMenu(false); }}
          onTheme={onTheme}
          onClose={() => setMenu(false)}
        />
      )}
    </div>
  );
}

function ViewSwitcher({
  view, theme, onView, onTheme, onClose,
}: {
  view: View; theme: Theme; onView: (v: View) => void; onTheme: (t: Theme) => void; onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
      <div className="di-menu" style={{
        position: "absolute", top: 46, left: 8, zIndex: 21, width: 300,
        background: "var(--di-surface)", border: "1px solid var(--di-rule)", borderRadius: 14,
        boxShadow: "0 30px 70px -24px rgba(0,0,0,.8)", padding: 8,
      }}>
        {VIEWS.map((v) => {
          const active = v.id === view;
          return (
            <button
              key={v.id} className="di-btn" onClick={() => onView(v.id)}
              style={{
                display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                padding: "9px 11px", border: "1px solid " + (active ? "var(--di-rule-strong)" : "transparent"),
                borderRadius: 10, background: active ? "var(--di-surface-elev)" : "transparent", cursor: "pointer",
                marginBottom: 2,
              }}
            >
              <span style={{
                width: 28, height: 28, flex: "0 0 auto", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                background: active ? "var(--di-spot)" : "var(--di-surface-sunken)",
              }}>
                <Icon name={v.icon} size={15} color={active ? "#3a140a" : "var(--di-ink-soft)"} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--di-ink)" }}>{v.label}</span>
                <span style={{ display: "block", fontSize: 10, color: "var(--di-ink-mute)" }}>{v.sub}</span>
              </span>
              {active && <Icon name="check" size={14} color="var(--di-spot)" />}
            </button>
          );
        })}
        <div style={{ height: 1, background: "var(--di-rule-inner)", margin: "8px 4px" }} />
        <div className="di-eyebrow" style={{ padding: "2px 6px 8px" }}>Rail theme</div>
        <div style={{ display: "flex", gap: 6, padding: "0 4px 4px" }}>
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id} className="di-btn" onClick={() => onTheme(t.id)} title={t.label}
                style={{
                  flex: 1, height: 30, borderRadius: 8, cursor: "pointer",
                  border: "1px solid " + (active ? "var(--di-spot)" : "var(--di-rule)"),
                  background: active ? "var(--di-surface-elev)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 999, background: t.swatch }} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Absolute scroll region inside the rail (below the 52px nav zone). */
export function RailScroll({ top = 52, bottom = 0, children, style }: {
  top?: number; bottom?: number; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div className="di-scroll" style={{
      position: "absolute", top, left: 0, width: 340, bottom, zIndex: 5,
      boxSizing: "border-box", padding: "0 14px 12px", ...style,
    }}>
      {children}
    </div>
  );
}

/** Absolute bottom dock inside the rail (search / commit / raw-terminal). */
export function RailDock({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      position: "absolute", left: 0, bottom: 0, width: 340, zIndex: 6, boxSizing: "border-box",
      padding: "12px 14px", borderTop: "1px solid var(--di-rail-border)", background: "var(--di-rail-dock-bg)", ...style,
    }}>
      {children}
    </div>
  );
}

/** Main working area — everything right of the 340px rail, full height. */
export function MainColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", top: 0, left: 340, right: 0, bottom: 0, display: "flex", flexDirection: "column", zIndex: 3, ...style }}>{children}</div>;
}
