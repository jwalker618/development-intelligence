import { Icon, RailTitle } from "../primitives";
import { RailDock, MainColumn } from "../Shell";
import type { SessionState } from "../state";

type Viewport = "phone" | "tablet" | "desktop";
const VP: { id: Viewport; icon: string; label: string; w: number; h: number; device: string }[] = [
  { id: "phone", icon: "smartphone", label: "Phone", w: 288, h: 588, device: "iPhone 15 · 393×852" },
  { id: "tablet", icon: "tablet", label: "Tablet", w: 440, h: 588, device: "iPad · 820×1180" },
  { id: "desktop", icon: "monitor", label: "Desktop", w: 620, h: 420, device: "Desktop · 1280×800" },
];

export function PreviewScreen({
  s, onViewport, onSendToAgent,
}: {
  s: SessionState;
  onViewport: (v: Viewport) => void;
  onSendToAgent: () => void;
}) {
  const vp = s.preview.viewport;
  const frame = VP.find((v) => v.id === vp)!;
  return (
    <>
      {/* ── rail ── */}
      <div style={{ position: "absolute", top: 52, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        <RailTitle style={{ padding: "2px 2px 11px" }}>Preview</RailTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", border: "1px solid var(--di-rail-row-border)",
          borderRadius: 9, background: "var(--di-rail-row-bg)", marginBottom: 8 }}>
          <Icon name="globe" size={13} color="var(--di-rail-hue)" />
          <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink-mute)" }}>{s.preview.host}</span>
          <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink)" }}>{s.preview.route}</span>
          <span style={{ flex: 1 }} />
          <Icon name="rotate-cw" size={13} color="var(--di-ink-mute)" style={{ cursor: "pointer" }} />
        </div>
        <div style={{ display: "flex", gap: 5, padding: 4, border: "1px solid var(--di-rail-row-border)", borderRadius: 10, background: "#141b2e" }}>
          {VP.map((v) => {
            const active = v.id === vp;
            return (
              <button key={v.id} className="di-btn" onClick={() => onViewport(v.id)} aria-pressed={active}
                style={{ flex: 1, height: 30, border: 0, borderRadius: 7, background: active ? "var(--di-spot)" : "transparent",
                  color: active ? "#3a140a" : "var(--di-rail-title)", fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <Icon name={v.icon} size={13} />{v.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="di-scroll" style={{ position: "absolute", top: 178, left: 0, width: 340, bottom: 56, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        <div className="di-eyebrow" style={{ padding: "2px 2px 9px" }}>Routes</div>
        {s.preview.routes.map((r) => {
          const active = r.active;
          return (
            <div key={r.path} className="di-row di-btn" style={{ position: "relative", display: "flex", alignItems: "center", gap: 9,
              padding: "8px 10px 8px 12px", borderRadius: 8, background: active ? "var(--di-rail-row-bg)" : "transparent",
              border: active ? "1px solid var(--di-rail-row-border)" : "1px solid transparent", marginBottom: 3, cursor: "pointer", overflow: "hidden" }}>
              {active && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--di-rail-hue)" }} />}
              <Icon name={active ? "radio" : "circle"} size={11} color={active ? "var(--di-info)" : "#586573"} />
              <span className="di-mono" style={{ fontSize: 11.5, color: active ? "var(--di-ink)" : "var(--di-ink-soft)", flex: 1 }}>{r.path}</span>
              <span style={{ fontSize: 10, color: "#6f8296" }}>{r.label}</span>
            </div>
          );
        })}

        <div className="di-eyebrow" style={{ padding: "14px 2px 9px" }}>Runtime</div>
        <div style={{ border: "1px solid #5a2626", borderRadius: 10, background: "#1a0f0f", padding: "10px 11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            <Icon name="alert-octagon" size={13} color="var(--di-neg)" />
            <span style={{ fontSize: 11.5, color: "var(--di-ink)", fontWeight: 600, flex: 1 }}>2 errors · 1 warning</span>
          </div>
          {s.preview.runtime.map((r, i) => (
            <div key={i} className="di-mono" style={{ fontSize: 10, color: "#e79b9b", lineHeight: 1.5, background: "#120a0a", borderRadius: 6, padding: "7px 8px", marginBottom: 9 }}>
              {r.text}<br /><span style={{ color: "#8a6a6a" }}>{r.at}</span>
            </div>
          ))}
          <button className="di-btn" onClick={onSendToAgent} style={{ width: "100%", height: 32, border: 0, borderRadius: 8, background: "var(--di-cta)",
            color: "#3a140a", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="corner-up-left" size={13} />Send to agent
          </button>
        </div>
      </div>

      <RailDock style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 10px", borderRadius: 999,
          background: "#0d2417", border: "1px solid #234a2e", fontSize: 10.5, color: "var(--di-pos)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--di-pos)", animation: "di-pulse 2s infinite" }} />hot-reload
        </span>
        <span style={{ flex: 1 }} />
        <span className="di-mono" style={{ fontSize: 10.5, color: "#6f8296" }}>built {s.preview.builtAgo} ago</span>
      </RailDock>

      {/* ── main: device-framed running app ── */}
      <MainColumn style={{ background: "radial-gradient(130% 90% at 50% -10%,#123152 0%,#0a1f33 45%,#07131f 100%)", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 16, left: 20, display: "inline-flex", alignItems: "center", gap: 8, height: 28, padding: "0 12px",
          borderRadius: 999, background: "rgba(10,20,32,.7)", border: "1px solid #24384f" }} className="di-mono">
          <Icon name="lock" size={11} color="var(--di-pos)" />
          <span style={{ fontSize: 11, color: "var(--di-ink-mute)" }}>{s.preview.host}{s.preview.route}</span>
        </div>
        <div style={{ position: "absolute", top: 16, right: 20, display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span className="di-mono" style={{ fontSize: 11, color: "#8aa0b5" }}>{frame.device}</span>
          <Icon name="external-link" size={15} color="#8aa0b5" style={{ cursor: "pointer" }} />
        </div>
        <DeviceFrame w={frame.w} h={frame.h} phone={vp === "phone"} />
      </MainColumn>
    </>
  );
}

function DeviceFrame({ w, h, phone }: { w: number; h: number; phone: boolean }) {
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: phone ? 44 : 20, background: "#05070a",
      border: "1px solid #2a3a49", boxShadow: "0 40px 80px -20px rgba(0,0,0,.8), inset 0 0 0 6px #12181f", padding: 11 }}>
      {phone && <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", width: 86, height: 24, borderRadius: 999, background: "#05070a", zIndex: 3 }} />}
      <div style={{ width: "100%", height: "100%", borderRadius: phone ? 34 : 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: "system-ui" }}>
        {phone && (
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: "14px 22px 8px" }}>
            <span className="di-mono" style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>9:41</span>
            <span style={{ flex: 1 }} />
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <Icon name="signal" size={14} color="#1a1a1a" /><Icon name="wifi" size={14} color="#1a1a1a" /><Icon name="battery-full" size={17} color="#1a1a1a" />
            </span>
          </div>
        )}
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderBottom: "1px solid #f0ede7" }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: "#0b2237" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Review queue</span>
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 10px", borderRadius: 999, background: "#fbe7e0", color: "#c2512f", fontSize: 11, fontWeight: 600 }}>2 need you</span>
        </div>
        <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
          <div style={{ border: "1px solid #f0d9cf", borderRadius: 12, background: "#fdf6f2", padding: "13px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: "#c2512f" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111", flex: 1 }}>server/review.ts</span>
              <span style={{ fontSize: 11, color: "#c2512f" }}>merge conflict</span>
            </div>
            <div style={{ fontSize: 12, color: "#7a7a7a", lineHeight: 1.4 }}>Both branches touched the pending filter.</div>
          </div>
          <div style={{ border: "1px solid #e6f0e9", borderRadius: 12, background: "#f4faf6", padding: "13px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: "#2e9e6a" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111", flex: 1 }}>ReviewQueue.tsx</span>
              <span style={{ fontSize: 11, color: "#2e9e6a", fontWeight: 600 }}>reviewed</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button style={{ height: 46, border: 0, borderRadius: 12, background: "#c2512f", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "system-ui" }}>Merge 2 reviewed</button>
        </div>
        {phone && <div style={{ flex: "0 0 auto", height: 5, margin: "0 auto 9px", width: 120, borderRadius: 999, background: "#111", opacity: 0.85 }} />}
      </div>
    </div>
  );
}
