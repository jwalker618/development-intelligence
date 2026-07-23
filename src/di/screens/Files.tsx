import { useState } from "react";
import { Icon } from "../primitives";
import { MainColumn } from "../Shell";

interface Node { name: string; kind: "dir" | "file"; icon: string; color?: string; size?: string; open?: boolean; pinned?: boolean; selected?: boolean; indent: number; children?: boolean; }

const TREE: Node[] = [
  { name: "web-app", kind: "dir", icon: "folder-git-2", color: "var(--di-spot)", open: true, indent: 0 },
  { name: "src/components", kind: "dir", icon: "folder", color: "#7f9bb5", open: true, indent: 1 },
  { name: "ReviewQueue.tsx", kind: "file", icon: "file-code-2", color: "var(--di-info)", size: "8.4KB", pinned: true, selected: true, indent: 2 },
  { name: "api.ts", kind: "file", icon: "file-code-2", color: "#7f9bb5", size: "2.1KB", indent: 2 },
  { name: "api", kind: "dir", icon: "folder-git-2", color: "#7f9bb5", indent: 1 },
  { name: "infra", kind: "dir", icon: "folder-git-2", color: "#7f9bb5", indent: 1 },
];

const FILE_BODY = [
  "export function ReviewQueue({ changes }: Props) {",
  "  const pending = changes.filter(c => c.needsYou);",
  "  const reviewed = changes.filter(c => c.reviewed);",
  "  return <section>{pending.map(renderRow)}</section>;",
];

export function FilesScreen() {
  const [pins, setPins] = useState<Record<string, boolean>>({ "ReviewQueue.tsx": true });
  return (
    <>
      {/* ── rail: tree ── */}
      <div className="di-scroll di-mono" style={{ position: "absolute", top: 52, left: 0, width: 340, bottom: 0, boxSizing: "border-box", padding: "0 10px 8px", zIndex: 5, fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 4px 9px" }}>
          <span className="di-eyebrow" style={{ flex: 1, fontFamily: "var(--di-font-sans)" }}>Files</span>
          {["file-plus-2", "folder-plus", "upload"].map((ic) => (
            <button key={ic} className="di-btn" aria-label={ic} style={{ width: 26, height: 26, border: "1px solid var(--di-rule)", borderRadius: 7,
              background: "transparent", color: "var(--di-ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={ic} size={13} />
            </button>
          ))}
        </div>
        {TREE.map((n) => {
          const pinned = n.kind === "file" ? pins[n.name] : false;
          return (
            <div key={n.name} className={n.kind === "file" ? "di-row di-btn" : ""} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", marginLeft: n.indent * 16,
              borderRadius: n.selected ? 6 : 0, background: n.selected ? "#12283f" : "transparent",
              border: n.selected ? "1px solid var(--di-rule-strong)" : "1px solid transparent",
              color: n.selected ? "var(--di-ink)" : n.kind === "dir" ? "var(--di-ink-soft)" : "var(--di-ink-soft)",
              fontWeight: n.name === "web-app" ? 600 : 400, cursor: n.kind === "file" ? "pointer" : "default",
            }}>
              <Icon name={n.kind === "dir" ? (n.open ? "chevron-down" : "chevron-right") : "file-code-2"} size={13} color={n.kind === "dir" ? "var(--di-ink-mute)" : n.color} />
              {n.kind === "dir" && <Icon name={n.icon} size={14} color={n.color} />}
              <span style={{ flex: 1 }}>{n.name}</span>
              {n.size && <span style={{ fontSize: 9, color: "#6f8296", marginRight: pinned ? 6 : 0 }}>{n.size}</span>}
              {n.kind === "file" && (
                <button className="di-btn" aria-label={pinned ? "Unpin from context" : "Pin to context"}
                  onClick={() => setPins((p) => ({ ...p, [n.name]: !p[n.name] }))}
                  style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
                  <Icon name="pin" size={13} color={pinned ? "var(--di-warn)" : "#3e5670"} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── main: metadata bar + file body ── */}
      <MainColumn style={{ background: "var(--di-canvas)" }}>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "12px 20px", borderBottom: "1px solid var(--di-rule)", background: "var(--di-panel-alt)" }}>
          {["312 rows", "8.4 KB", "TypeScript", "edited 2h ago"].map((m, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 9, alignItems: "center" }}>
              {i > 0 && <span style={{ color: "var(--di-rule-strong)" }}>·</span>}
              <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink-mute)" }}>{m}</span>
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <button className="di-btn" style={{ height: 30, padding: "0 12px", border: "1px solid var(--di-rule-strong)", borderRadius: 8,
            background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="file-pen-line" size={13} />Edit
          </button>
        </div>
        <div className="di-scroll di-mono" style={{ flex: 1, fontSize: 12.5, lineHeight: 1.85, padding: "8px 0 20px" }}>
          {FILE_BODY.map((line, i) => (
            <div key={i} style={{ display: "flex" }}>
              <span style={{ width: 56, flex: "0 0 auto", textAlign: "right", paddingRight: 14, color: "var(--di-rule-strong)" }}>{10 + i}</span>
              <span style={{ color: i === 0 ? "#7f9bb5" : "var(--di-ink-soft)", whiteSpace: "pre" }}>{line}</span>
            </div>
          ))}
        </div>
      </MainColumn>
    </>
  );
}
