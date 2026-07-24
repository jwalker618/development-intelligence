import { useEffect, useRef, useState } from "react";
import { api, type FileContent } from "../../api";
import { Icon } from "../primitives";
import { MainColumn } from "../Shell";
import type { TreeNode } from "../control";

type Dialog = { kind: "file" | "folder" | "upload"; dir: string } | null;

export function FilesScreen({ tree, sessionId }: { tree: TreeNode | null; sessionId: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<FileContent | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const openFile = (path: string) => {
    setSelected(path); setEditing(false); setFile(null); setLoadingFile(true);
    void api.file(sessionId, path).then((f) => setFile(f)).catch(() => setFile(null)).finally(() => setLoadingFile(false));
  };
  const save = () => { if (!selected) return; void api.saveFile(sessionId, selected, draft).then(() => { setEditing(false); openFile(selected); }); };

  const rows: React.ReactNode[] = [];
  const walk = (node: TreeNode) => {
    const isOpen = open[node.path] ?? node.depth <= 1;
    if (node.depth > 0) {
      const pinned = node.kind === "file" ? pins[node.path] : false;
      rows.push(
        <div key={node.path || node.name} className={node.kind === "file" ? "di-row di-btn" : "di-btn"}
          onClick={() => node.kind === "dir" ? setOpen((o) => ({ ...o, [node.path]: !isOpen })) : openFile(node.path)}
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
          {(["file", "folder", "upload"] as const).map((k) => (
            <button key={k} className="di-btn" aria-label={k} onClick={() => setDialog({ kind: k, dir: "" })} style={{ width: 26, height: 26, border: "1px solid var(--di-rule)", borderRadius: 7, background: "transparent", color: "var(--di-ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={k === "file" ? "file-plus-2" : k === "folder" ? "folder-plus" : "upload"} size={13} />
            </button>
          ))}
        </div>
        {tree && tree.depth === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", color: "var(--di-ink)", fontWeight: 600 }}>
            <Icon name="chevron-down" size={13} color="var(--di-ink-mute)" /><Icon name="folder-git-2" size={14} color="var(--di-spot)" /><span>{tree.name}</span>
          </div>
        )}
        {!tree && [70, 55, 80, 48, 62, 75, 52].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, paddingLeft: (i % 3) * 14 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: "#12283f", opacity: 0.6, animation: "di-pulse 1.6s infinite" }} />
            <div style={{ width: `${w}%`, height: 11, borderRadius: 6, background: "#12283f", opacity: 0.6, animation: "di-pulse 1.6s infinite" }} />
          </div>
        ))}
        {rows}
      </div>

      <MainColumn style={{ background: "var(--di-canvas)" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--di-ink-mute)", fontSize: 13, gap: 8 }}>
            <Icon name="file-code-2" size={16} />Select a file from the tree.
          </div>
        ) : (
          <>
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, padding: "12px 20px", borderBottom: "1px solid var(--di-rule)", background: "var(--di-panel-alt)" }}>
              <Icon name={editing ? "file-pen-line" : "file-code-2"} size={15} color={editing ? "var(--di-warn)" : "var(--di-ink-mute)"} />
              <span className="di-mono" style={{ fontSize: 11, color: "var(--di-ink)" }}>{selected}</span>
              {editing && draft !== file?.content && <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 9px", borderRadius: 999, background: "#1a1206", border: "1px solid #5a3316", fontSize: 10, color: "var(--di-warn)" }}>unsaved</span>}
              <div style={{ flex: 1 }} />
              {file && !file.binary && !editing && (
                <button className="di-btn" onClick={() => { setDraft(file.content); setEditing(true); }} style={{ height: 30, padding: "0 12px", border: "1px solid var(--di-rule-strong)", borderRadius: 8, background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="file-pen-line" size={13} />Edit</button>
              )}
              {editing && (
                <>
                  <button className="di-btn" onClick={() => setEditing(false)} style={{ height: 30, padding: "0 12px", border: "1px solid var(--di-rule)", borderRadius: 8, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button className="di-btn" onClick={save} style={{ height: 30, padding: "0 13px", border: 0, borderRadius: 8, background: "var(--di-spot)", color: "#3a140a", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="save" size={13} />Save</button>
                </>
              )}
              {file?.binary && <button className="di-btn" style={{ height: 30, padding: "0 12px", border: "1px solid var(--di-rule)", borderRadius: 8, background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="download" size={13} />Download</button>}
            </div>
            {loadingFile ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--di-ink-mute)", fontSize: 12.5 }}>Loading…</div>
            ) : file?.binary ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
                <div style={{ textAlign: "center", maxWidth: 380 }}>
                  <div style={{ width: 58, height: 58, margin: "0 auto 16px", borderRadius: 14, background: "#0e2233", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="file-image" size={26} color="var(--di-ink-mute)" /></div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--di-ink)", marginBottom: 7 }}>Preview not available</div>
                  <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", lineHeight: 1.55 }}>This is a binary file, so there's nothing to diff or edit here. Download it or open it in your local tools.</div>
                </div>
              </div>
            ) : editing ? (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="di-mono"
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } }}
                style={{ flex: 1, border: 0, outline: "none", resize: "none", background: "var(--di-canvas)", color: "var(--di-ink-soft)", fontSize: 12.5, lineHeight: 1.85, padding: "12px 20px" }} />
            ) : (
              <div className="di-scroll di-mono" style={{ flex: 1, fontSize: 12.5, lineHeight: 1.85, padding: "8px 0 20px" }}>
                {(file?.content ?? "").split("\n").map((line, i) => (
                  <div key={i} style={{ display: "flex" }}>
                    <span style={{ width: 56, flex: "0 0 auto", textAlign: "right", paddingRight: 14, color: "var(--di-rule-strong)" }}>{i + 1}</span>
                    <span style={{ color: "var(--di-ink-soft)", whiteSpace: "pre" }}>{line}</span>
                  </div>
                ))}
                {file?.truncated && <div style={{ padding: "8px 20px", color: "var(--di-ink-mute)" }}>… file truncated</div>}
              </div>
            )}
          </>
        )}
      </MainColumn>

      {dialog && <AddDialog dialog={dialog} sessionId={sessionId} onClose={() => setDialog(null)} onCreated={(p) => { setDialog(null); openFile(p); }} />}
    </>
  );
}

function AddDialog({ dialog, sessionId, onClose, onCreated }: { dialog: NonNullable<Dialog>; sessionId: string; onClose: () => void; onCreated: (path: string) => void }) {
  const [kind, setKind] = useState(dialog.kind);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const prefix = dialog.dir ? dialog.dir + "/" : "";
  const create = () => {
    const path = prefix + name.trim();
    if (!name.trim()) return;
    if (kind === "folder") void api.mkdir(sessionId, path).then(() => onClose());
    else void api.saveFile(sessionId, path, "").then(() => onCreated(path));
  };
  const upload = (f: File) => { void api.upload(sessionId, prefix + f.name, f).then(() => onClose()); };
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,10,18,.55)", zIndex: 20 }} />
      <div className="di-menu" style={{ position: "absolute", top: 96, left: 380, width: 420, maxWidth: "calc(100% - 60px)", zIndex: 21, border: "1px solid var(--di-rule)", borderRadius: 14, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "15px 18px", borderBottom: "1px solid #17293a" }}>
          <Icon name="file-plus-2" size={16} color="var(--di-info)" /><span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--di-ink)", flex: 1 }}>Add to {dialog.dir || "repo root"}</span>
          <button className="di-btn" onClick={onClose} aria-label="Close" style={{ border: 0, background: "transparent", cursor: "pointer", display: "flex" }}><Icon name="x" size={16} color="var(--di-ink-mute)" /></button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", gap: 4, padding: 4, border: "1px solid var(--di-rule)", borderRadius: 10, background: "#0b1826", marginBottom: 16 }}>
            {(["file", "folder", "upload"] as const).map((k) => (
              <button key={k} className="di-btn" onClick={() => setKind(k)} style={{ flex: 1, height: 36, border: 0, borderRadius: 8, background: kind === k ? "#12283f" : "transparent", color: kind === k ? "var(--di-ink)" : "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textTransform: "capitalize" }}>
                <Icon name={k === "file" ? "file-plus-2" : k === "folder" ? "folder-plus" : "upload"} size={13} />{k}
              </button>
            ))}
          </div>
          {kind === "upload" ? (
            <>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button className="di-btn" onClick={() => fileRef.current?.click()} style={{ width: "100%", height: 90, border: "1px dashed #3e6794", borderRadius: 10, background: "#0a1c2e", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 12.5, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Icon name="upload" size={20} color="var(--di-info)" />Choose a file to upload into {dialog.dir || "the repo root"}
              </button>
            </>
          ) : (
            <>
              <div className="di-eyebrow" style={{ marginBottom: 8 }}>Name</div>
              <div style={{ display: "flex", alignItems: "center", gap: 2, height: 42, padding: "0 12px", border: "1px solid #34608c", borderRadius: 10, background: "#0a1c2e", boxShadow: "0 0 0 3px rgba(57,211,186,.1)", marginBottom: 8 }}>
                {prefix && <span className="di-mono" style={{ fontSize: 12.5, color: "#6f8296" }}>{prefix}</span>}
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={kind === "folder" ? "components" : "ReviewRow.tsx"} spellCheck={false}
                  className="di-mono" style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 12.5 }} />
              </div>
              <div style={{ fontSize: 11, color: "#6f8296", marginBottom: 18 }}>{kind === "file" ? "Opens in the editor after it's created." : "Creates an empty folder."}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="di-btn" onClick={onClose} style={{ height: 40, padding: "0 15px", border: "1px solid var(--di-rule)", borderRadius: 10, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <span style={{ flex: 1 }} />
                <button className="di-btn" onClick={create} style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 10, background: "var(--di-spot)", color: "#3a140a", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Create {kind}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
