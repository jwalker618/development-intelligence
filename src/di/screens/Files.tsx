import { useState } from "react";
import { Icon } from "../primitives";
import { MainColumn } from "../Shell";
import { SampleChip } from "./Session";
import type { TreeNode } from "../control";

export function FilesScreen({ tree, onOpen }: { tree: TreeNode | null; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const rows: React.ReactNode[] = [];
  const walk = (node: TreeNode) => {
    const isOpen = open[node.path] ?? node.depth <= 1;
    if (node.depth > 0) {
      const pinned = node.kind === "file" ? pins[node.path] : false;
      rows.push(
        <div key={node.path || node.name} className={node.kind === "file" ? "di-row di-btn" : "di-btn"}
          onClick={() => node.kind === "dir" ? setOpen((o) => ({ ...o, [node.path]: !isOpen })) : (setSelected(node.path), onOpen(node.path))}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", marginLeft: (node.depth - 1) * 16,
            borderRadius: node.path === selected ? 6 : 0, background: node.path === selected ? "#12283f" : "transparent",
            border: node.path === selected ? "1px solid var(--di-rule-strong)" : "1px solid transparent",
            color: node.path === selected ? "var(--di-ink)" : "var(--di-ink-soft)", cursor: "pointer" }}>
          <Icon name={node.kind === "dir" ? (isOpen ? "chevron-down" : "chevron-right") : "file-code-2"} size={13} color={node.kind === "dir" ? "var(--di-ink-mute)" : "#7f9bb5"} />
          {node.kind === "dir" && <Icon name="folder" size={14} color="#7f9bb5" />}
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
          {node.kind === "file" && (
            <button className="di-btn" aria-label={pinned ? "Unpin" : "Pin to context"} onClick={(e) => { e.stopPropagation(); setPins((p) => ({ ...p, [node.path]: !p[node.path] })); }}
              style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
              <Icon name="pin" size={13} color={pinned ? "var(--di-warn)" : "#3e5670"} />
            </button>
          )}
        </div>,
      );
    }
    if (node.kind === "dir" && (isOpen || node.depth === 0)) node.children.forEach(walk);
  };
  if (tree) walk(tree);

  return (
    <>
      <div className="di-scroll di-mono" style={{ position: "absolute", top: 52, left: 0, width: 340, bottom: 0, boxSizing: "border-box", padding: "0 10px 8px", zIndex: 5, fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 4px 9px" }}>
          <span className="di-eyebrow" style={{ flex: 1, fontFamily: "var(--di-font-sans)" }}>Files</span>
          {["file-plus-2", "folder-plus", "upload"].map((ic) => (
            <button key={ic} className="di-btn" aria-label={ic} style={{ width: 26, height: 26, border: "1px solid var(--di-rule)", borderRadius: 7, background: "transparent", color: "var(--di-ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={ic} size={13} />
            </button>
          ))}
        </div>
        {tree && tree.depth === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", color: "var(--di-ink)", fontWeight: 600 }}>
            <Icon name="chevron-down" size={13} color="var(--di-ink-mute)" /><Icon name="folder-git-2" size={14} color="var(--di-spot)" />
            <span>{tree.name}</span>
          </div>
        )}
        {!tree && <div style={{ padding: "8px", color: "var(--di-ink-mute)", fontFamily: "var(--di-font-sans)", fontSize: 12 }}>Loading tree…</div>}
        {rows}
      </div>

      <MainColumn style={{ background: "var(--di-canvas)" }}>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "12px 20px", borderBottom: "1px solid var(--di-rule)", background: "var(--di-panel-alt)" }}>
          <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink-mute)" }}>{selected ?? "no file selected"}</span>
          <div style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><SampleChip /><span style={{ fontSize: 10.5, color: "var(--di-ink-mute)" }}>inline view lands with editor wiring</span></span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--di-ink-mute)", fontSize: 13, gap: 8 }}>
          <Icon name="file-code-2" size={16} />{selected ? "File view is next-phase wiring." : "Select a file from the tree."}
        </div>
      </MainColumn>
    </>
  );
}
