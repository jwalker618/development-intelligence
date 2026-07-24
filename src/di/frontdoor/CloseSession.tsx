import { useState } from "react";
import { api } from "../../api";
import { Icon } from "../primitives";

/** Close/delete a session — destructive confirm, plain prose (37g). */
export function CloseSession({ id, repo, branch, onCancel, onClosed }: {
  id: string; repo: string; branch: string | null; onCancel: () => void; onClosed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const doClose = () => { setBusy(true); void api.deleteSession(id).then(onClosed).catch((e) => { setErr(e.message); setBusy(false); }); };
  const name = repo.split("/").pop();
  return (
    <div className="di-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,10,18,.72)" }}>
      <div className="di-menu" style={{ width: 460, maxWidth: "calc(100% - 40px)", border: "1px solid #5a2626", borderRadius: 16, background: "#140c0c", boxShadow: "0 40px 90px -20px rgba(0,0,0,.85)", padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "#2a1414", border: "1px solid #5a2626", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="alert-octagon" size={18} color="var(--di-neg)" /></span>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--di-ink)" }}>Close this session?</div>
        </div>
        <div style={{ fontSize: 13, color: "#d8c4c4", lineHeight: 1.6, marginBottom: 8 }}>
          This deletes the <b style={{ color: "var(--di-ink)" }}>{name}</b> worktree and its container. Your branch <b style={{ color: "var(--di-ink)" }}>{branch ?? "—"}</b> is safe on GitHub, but any uncommitted changes and this session's chat history will be lost.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid #5a3316", borderRadius: 9, background: "#1a1206", marginBottom: 18 }}>
          <Icon name="alert-triangle" size={14} color="var(--di-warn)" /><span style={{ fontSize: 11.5, color: "#e0b06a" }}>Commit or push first if you want to keep those changes.</span>
        </div>
        {err && <div style={{ fontSize: 11.5, color: "var(--di-neg)", marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="di-btn" onClick={onCancel} style={{ height: 42, padding: "0 18px", border: "1px solid var(--di-rule)", borderRadius: 11, background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Keep session</button>
          <span style={{ flex: 1 }} />
          <button className="di-btn" onClick={doClose} disabled={busy} style={{ height: 42, padding: "0 18px", border: 0, borderRadius: 11, background: "var(--di-neg)", color: "#2a0a0a", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, opacity: busy ? 0.6 : 1 }}><Icon name="x" size={15} />Close &amp; delete</button>
        </div>
      </div>
    </div>
  );
}
