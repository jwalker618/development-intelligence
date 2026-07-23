import { useState } from "react";
import { AuthError, login, setToken } from "../api";
import { Icon } from "./primitives";

/** Token + optional TOTP → device credential. Plain prose throughout (auth is
 *  never caveman voice — brand auto-clarity rule). This is also the 401
 *  recovery surface: "re-enter token" lands here. */
export function Login({ onDone, reason }: { onDone: () => void; reason?: string }) {
  const [token, setTok] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(reason ?? null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await login(token.trim(), needCode ? code.trim() : undefined);
      if (res.mfaRequired) { setNeedCode(true); setBusy(false); return; }
      if (res.credential) { setToken(res.credential); onDone(); return; }
      setErr("Login did not return a credential."); setBusy(false);
    } catch (e) {
      const a = e as AuthError;
      setErr(a.message + (a.attemptsLeft != null ? ` — ${a.attemptsLeft} attempts left` : ""));
      setBusy(false);
    }
  };

  return (
    <div className="di-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--di-canvas)" }}>
      <div style={{ width: 380, maxWidth: "calc(100% - 40px)", background: "var(--di-surface)", border: "1px solid var(--di-rule)",
        borderRadius: 16, padding: 26, boxShadow: "0 40px 90px -30px rgba(0,0,0,.8)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--di-spot)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="square-arrow-out-down-right" size={17} color="#3a140a" />
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--di-ink)" }}>Development Intelligence</span>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 12.5, lineHeight: 1.5, color: "var(--di-ink-mute)" }}>
          {needCode
            ? "Enter the 6-digit code from your authenticator to finish signing in."
            : "Sign in with your access token. It's exchanged for a revocable 30-day device credential stored only on this device."}
        </p>

        {!needCode ? (
          <input autoFocus type="password" value={token} onChange={(e) => setTok(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Access token" spellCheck={false}
            style={inputStyle} />
        ) : (
          <input autoFocus className="di-mono" value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="123456" inputMode="numeric" maxLength={6}
            style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center" }} />
        )}

        {err && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11.5, color: "var(--di-neg)" }}>
            <Icon name="alert-triangle" size={13} />{err}
          </div>
        )}

        <button className="di-btn" disabled={busy || (!needCode && !token.trim()) || (needCode && code.trim().length < 6)} onClick={submit}
          style={{ width: "100%", height: 42, marginTop: 16, border: 0, borderRadius: 10, background: "var(--di-cta)", color: "#3a140a",
            fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Signing in…" : needCode ? "Verify" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 13px", borderRadius: 10, border: "1px solid var(--di-rule)",
  background: "var(--di-surface-sunken)", color: "var(--di-ink)", fontSize: 13, outline: "none", boxSizing: "border-box",
};
