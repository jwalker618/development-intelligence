import { useEffect, useRef, useState } from "react";
import { AuthError, login, setToken } from "../../api";
import { Icon } from "../primitives";
import { AuthCard, AuthHeader, SignalScene, StepDots, authCta, authInput } from "./SignalCard";

/** Login — token → MFA code, with throttle and 401 re-auth states (36e/38a-c).
 *  Plain prose throughout (brand auth rule). Also the 401 recovery surface. */
export function Login({ onDone, reauth }: { onDone: () => void; reauth?: boolean }) {
  const [token, setTok] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"token" | "code">("token");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (lockUntil == null) return;
    const t = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lockUntil]);
  const remaining = lockUntil != null ? Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)) : 0;
  const locked = remaining > 0;

  const submit = async (c?: string) => {
    setBusy(true); setErr(null);
    try {
      const res = await login(token.trim(), step === "code" ? (c ?? code).trim() : undefined);
      if (res.mfaRequired) { setStep("code"); setBusy(false); return; }
      if (res.credential) { setToken(res.credential); onDone(); return; }
      setErr("Login did not return a credential."); setBusy(false);
    } catch (e) {
      const a = e as AuthError;
      if (a.retryAfter) { setLockUntil(Date.now() + a.retryAfter * 1000); setNow(0); }
      setErr(a.message + (a.attemptsLeft != null ? ` — ${a.attemptsLeft} left` : ""));
      setBusy(false);
    }
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <SignalScene dimRail={reauth}>
      <AuthCard width={reauth ? 420 : 400}>
        <AuthHeader
          title={reauth ? "Your session expired" : step === "code" ? (locked ? "Too many attempts" : "Enter your code") : "Development Intelligence"}
          subtitle={reauth ? "Re-enter your token to continue. Your sessions and work are safe — nothing was lost."
            : step === "code" ? (locked ? "For your security, code entry is paused. Nothing is wrong with your account." : "Enter the 6-digit code from your authenticator app.")
            : "Sign in to your workspace"} />

        {step === "token" ? (
          <>
            <div className="di-eyebrow" style={{ marginBottom: 8 }}>Access token</div>
            <div style={{ ...authInput, marginBottom: reauth ? 20 : 9, borderColor: err ? "var(--di-neg)" : "#34608c" }}>
              <Icon name="lock" size={16} color="var(--di-info)" />
              <input autoFocus type={show ? "text" : "password"} value={token} onChange={(e) => setTok(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && token.trim() && submit()} placeholder="Access token" spellCheck={false}
                className="di-mono" style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 14, letterSpacing: ".08em" }} />
              <button className="di-btn" onClick={() => setShow((s) => !s)} aria-label="Toggle visibility" style={{ border: 0, background: "transparent", cursor: "pointer", display: "flex", padding: 0 }}>
                <Icon name={show ? "eye" : "eye-off"} size={15} color="var(--di-ink-mute)" />
              </button>
            </div>
            {!reauth && <div style={{ fontSize: 11, color: "#6f8296", lineHeight: 1.5, marginBottom: 20 }}>Your token issues a 30-day device credential to this browser. You'll confirm with a 6-digit code next.</div>}
            {err && <ErrLine msg={err} />}
            <button className="di-btn" style={{ ...authCta, opacity: busy || !token.trim() ? 0.6 : 1 }} disabled={busy || !token.trim()} onClick={() => submit()}>
              {busy ? "Signing in…" : reauth ? "Resume" : "Continue"}<Icon name="arrow-up" size={16} color="#3a140a" style={{ transform: "rotate(90deg)" }} />
            </button>
            {reauth && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 }}>
                <Icon name="check-circle-2" size={13} color="var(--di-pos)" /><span style={{ fontSize: 11, color: "#6f8296" }}>Your sessions keep running in the background</span>
              </div>
            )}
            {!reauth && <StepDots count={2} active={0} />}
          </>
        ) : (
          <>
            <div className="di-eyebrow" style={{ marginBottom: 9 }}>6-digit code</div>
            <CodeBoxes code={code} locked={locked} onChange={(v) => { setCode(v); if (v.length === 6 && !locked) submit(v); }} />
            {locked ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, margin: "20px 0", padding: 16, border: "1px solid #3a2020", borderRadius: 12, background: "#160d0d" }}>
                <span className="di-eyebrow" style={{ color: "#c98a8a" }}>Try again in</span>
                <span className="di-mono" style={{ fontSize: 30, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em" }}>{mm}:{ss}</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "13px 0 20px" }}>
                  <Icon name="loader" size={13} color="var(--di-ink-mute)" /><span style={{ fontSize: 11.5, color: "#6f8296" }}>Codes rotate every 30s</span>
                </div>
                {err && <ErrLine msg={err} />}
              </>
            )}
            <button className="di-btn" style={{ ...authCta, opacity: busy || locked || code.length < 6 ? 0.6 : 1, cursor: locked ? "not-allowed" : "pointer" }}
              disabled={busy || locked || code.length < 6} onClick={() => submit()}>Verify &amp; continue</button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="di-btn" onClick={() => { setStep("token"); setCode(""); setErr(null); }} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--di-ink-mute)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="arrow-up" size={13} style={{ transform: "rotate(-90deg)" }} />Back to token
              </button>
            </div>
            {!locked && <StepDots count={2} active={1} />}
          </>
        )}
      </AuthCard>
    </SignalScene>
  );
}

function CodeBoxes({ code, locked, onChange }: { code: string; locked: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ position: "relative" }} onClick={() => ref.current?.focus()}>
      <input ref={ref} autoFocus value={code} inputMode="numeric" maxLength={6} disabled={locked}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "text" }} />
      <div style={{ display: "flex", gap: 9 }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < code.length;
          const cursor = i === code.length && !locked;
          return (
            <div key={i} style={{ flex: 1, height: 54, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${locked ? "#3a2020" : cursor ? "var(--di-info)" : "#2b4f75"}`, background: locked ? "#0e1620" : cursor ? "#0c2536" : "#0b1d2f",
              boxShadow: cursor ? "0 0 0 3px rgba(57,211,186,.15)" : "none" }}
              className="di-mono">
              <span style={{ fontSize: 21, fontWeight: 600, color: locked ? "#7a8a99" : "var(--di-ink)" }}>{code[i] ?? ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrLine({ msg }: { msg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, fontSize: 11.5, color: "var(--di-neg)" }}>
      <Icon name="alert-triangle" size={13} />{msg}
    </div>
  );
}
