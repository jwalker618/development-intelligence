import type { CSSProperties, ReactNode } from "react";

/** The DI logo mark — a teal diamond with a coral signal dot. */
export function DiMark({ size = 40 }: { size?: number }) {
  const inner = Math.round(size * 0.4);
  const dot = Math.round(size * 0.2);
  return (
    <span style={{ position: "relative", width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: "linear-gradient(150deg,#0e2a45,#0a1c30)", border: "1px solid #244a6e",
      boxShadow: "inset 0 1px 0 rgba(120,170,220,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: inner, height: inner, background: "linear-gradient(135deg,#39d3ba,#0e7c8c)", transform: "rotate(45deg)", borderRadius: 2 }} />
      <span style={{ position: "absolute", right: Math.round(size * 0.17), bottom: Math.round(size * 0.17), width: dot, height: dot,
        borderRadius: 999, background: "var(--di-spot)", boxShadow: "0 0 6px rgba(240,146,110,.7)" }} />
    </span>
  );
}

/** Full-screen signal backdrop: radial wash + faint vertical lines + rings. */
export function SignalScene({ children, dimRail }: { children: ReactNode; dimRail?: boolean }) {
  return (
    <div className="di-app" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(120% 90% at 50% 0%,#0e3151 0%,#0a1f34 42%,#050f1a 100%)", overflow: "hidden" }}>
      {dimRail && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 340, background: "linear-gradient(180deg,#171f34,#111725)", opacity: 0.5 }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: 340, height: 3, background: "linear-gradient(90deg,#4a60a8,#39d3ba)", opacity: 0.5 }} />
        </>
      )}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[[8, 0.03], [24, 0.05], [40, 0.07], [56, 0.03], [72, 0.05], [88, 0.07]].map(([x, a], i) => (
          <div key={i} style={{ position: "absolute", left: `${x}%`, top: 0, bottom: 0, width: 1,
            background: `linear-gradient(180deg,transparent,rgba(57,211,186,${a}),transparent)` }} />
        ))}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 520, height: 520, borderRadius: 999, border: "1px solid rgba(57,211,186,.08)" }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 340, height: 340, borderRadius: 999, border: "1px solid rgba(240,146,110,.07)" }} />
      </div>
      {children}
    </div>
  );
}

/** The frosted auth card. */
export function AuthCard({ width = 400, children, style }: { width?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", width, maxWidth: "calc(100% - 40px)", border: "1px solid #234a6e", borderRadius: 18,
      background: "rgba(9,20,33,.84)", boxShadow: "0 40px 90px -24px rgba(0,0,0,.85)", padding: "34px 34px 30px", zIndex: 2, ...style }}>
      {children}
    </div>
  );
}

/** Card header: mark + title + subtitle, centered. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 24 }}>
      <DiMark />
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--di-ink)", marginTop: 15, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  );
}

/** Progressive step dots (active index highlighted coral). */
export function StepDots({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ width: i === active ? 20 : 5, height: 5, borderRadius: 999, background: i === active ? "var(--di-spot)" : "#2b4056" }} />
      ))}
    </div>
  );
}

export const authInput: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 14px", border: "1px solid #34608c",
  borderRadius: 11, background: "#0a1c2e", boxShadow: "0 0 0 3px rgba(57,211,186,.12)", boxSizing: "border-box",
};

export const authCta: CSSProperties = {
  width: "100%", height: 48, border: 0, borderRadius: 11, background: "var(--di-spot)", color: "#3a140a",
  fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
};
