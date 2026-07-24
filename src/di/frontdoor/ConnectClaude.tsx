import { useEffect, useState } from "react";
import { api, type ClaudeAuthStatus } from "../../api";
import { Icon } from "../primitives";
import { AuthCard, AuthHeader, SignalScene, authCta } from "./SignalCard";

/** Connect Claude — guided flow (38d–g), wired to the real setup-token backend.
 *
 *  Design note: 38d depicts a device-code flow (DI shows a code you enter at
 *  claude.ai). The server implements `claude setup-token` — you open the URL it
 *  mints, authorize, and claude.ai gives YOU a code to paste back. This keeps
 *  the card aesthetic but follows the real steps (step 2 is a paste field), and
 *  doesn't fabricate the account email/plan (the server doesn't expose them). */
export function ConnectClaude({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyUrl = async (url: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        // Insecure-context / older-webview fallback: select a hidden textarea.
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — the URL is still visible to select manually */ }
  };

  useEffect(() => {
    void api.claudeAuth().then(setStatus).catch(() => setStatus({ state: "idle", url: null, detail: null, tail: "" }));
  }, []);

  const start = async () => {
    setBusy(true);
    try { setStatus(await api.claudeAuthStart()); } catch (e) { setStatus({ state: "error", url: null, detail: msg(e), tail: "" }); }
    setBusy(false);
  };
  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try { const s = await api.claudeAuthCode(code.trim()); setStatus(s); if (s.state === "done") onDone(); }
    catch (e) { setStatus((p) => ({ ...(p ?? { url: null, tail: "" }), state: "error", detail: msg(e) } as ClaudeAuthStatus)); }
    setBusy(false);
  };
  const cancel = async () => { try { await api.claudeAuthCancel(); } catch { /* noop */ } setStatus({ state: "idle", url: null, detail: null, tail: "" }); setCode(""); };

  if (manual) return <ManualToken onDone={onDone} onBack={() => setManual(false)} />;

  const st = status?.state ?? "idle";

  // connected
  if (st === "done") {
    return (
      <SignalScene>
        <AuthCard width={420}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 22 }}>
            <span style={{ width: 60, height: 60, borderRadius: 16, background: "#0d2417", border: "1px solid #234a2e", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Icon name="check" size={30} color="var(--di-pos)" />
            </span>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em" }}>Claude is connected</div>
            <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", marginTop: 5 }}>Claude Code can now run in your sessions.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", border: "1px solid #24384f", borderRadius: 12, background: "#0c1e30", marginBottom: 20 }}>
            <Icon name="lock" size={13} color="var(--di-ink-mute)" />
            <span style={{ fontSize: 11, color: "#6f8296" }}>Token stored on your workspace volume · never leaves it</span>
          </div>
          <button className="di-btn" style={authCta} onClick={onDone}>Start reviewing<Icon name="arrow-up" size={15} color="#3a140a" style={{ transform: "rotate(90deg)" }} /></button>
        </AuthCard>
      </SignalScene>
    );
  }

  // error / timed out
  if (st === "error") {
    return (
      <SignalScene>
        <AuthCard width={420}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 20 }}>
            <span style={{ width: 60, height: 60, borderRadius: 16, background: "#2a1414", border: "1px solid #5a2626", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Icon name="alert-octagon" size={28} color="var(--di-neg)" />
            </span>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em" }}>Connection didn't complete</div>
            <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", marginTop: 5, lineHeight: 1.5 }}>The code may have expired or been entered wrong.</div>
          </div>
          {status?.detail && <div className="di-mono" style={{ fontSize: 11, color: "#c98a8a", background: "#120a0a", border: "1px solid #3a1c1c", borderRadius: 9, padding: "11px 12px", marginBottom: 20 }}>{status.detail}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="di-btn" onClick={() => setManual(true)} style={{ flex: "0 0 auto", height: 44, padding: "0 16px", border: "1px solid var(--di-rule)", borderRadius: 11, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Use a token instead</button>
            <button className="di-btn" onClick={start} style={{ ...authCta, height: 44 }}><Icon name="rotate-cw" size={15} color="#3a140a" />Start over</button>
          </div>
        </AuthCard>
      </SignalScene>
    );
  }

  const awaiting = st === "awaiting-code" || st === "verifying";
  return (
    <SignalScene>
      <AuthCard width={440}>
        <AuthHeader title="Connect Claude" subtitle="Claude Code needs to sign in to your Anthropic account. This runs once." />
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 18 }}>
          <Step n={1} label={status?.url ? "Open this URL and sign in, then authorize" : "Press Begin to generate your sign-in link"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "5px 8px 5px 12px", border: "1px solid var(--di-rule)", borderRadius: 9, background: "#0a1c2e" }}>
              <span className="di-mono" title={status?.url ?? undefined} style={{ fontSize: 11.5, color: status?.url ? "#a9bccf" : "#5a7186", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{status?.url ?? "link appears here after Begin"}</span>
              <button className="di-btn" disabled={!status?.url} onClick={() => status?.url && void copyUrl(status.url)} style={{ height: 26, padding: "0 10px", border: 0, borderRadius: 6, background: "#12283f", color: copied ? "var(--di-pos)" : "var(--di-info)", fontSize: 11, fontWeight: 600, cursor: status?.url ? "pointer" : "default", opacity: status?.url ? 1 : 0.45, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name={copied ? "check" : "copy"} size={12} />{copied ? "Copied" : "Copy"}</button>
              {status?.url ? (
                <a className="di-btn" href={status.url} target="_blank" rel="noreferrer noopener" style={{ height: 26, padding: "0 10px", border: 0, borderRadius: 6, background: "var(--di-info)", color: "#062b26", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}><Icon name="external-link" size={12} />Open</a>
              ) : (
                <span className="di-btn" aria-disabled style={{ height: 26, padding: "0 10px", border: 0, borderRadius: 6, background: "var(--di-info)", color: "#062b26", fontSize: 11, fontWeight: 600, opacity: 0.45, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="external-link" size={12} />Open</span>
              )}
            </div>
          </Step>
          <Step n={2} label="Paste the code claude.ai gives you">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="paste code here" spellCheck={false} disabled={!awaiting}
              onKeyDown={(e) => e.key === "Enter" && submit()} className="di-mono"
              style={{ width: "100%", height: 46, textAlign: "center", border: "1px dashed #3e6794", borderRadius: 9, background: "#0a1c2e", color: "var(--di-ink)", fontSize: 15, letterSpacing: ".15em", outline: "none", boxSizing: "border-box" }} />
          </Step>
        </div>

        {awaiting ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", border: "1px solid #234a6e", borderRadius: 11, background: "#0c1e30", marginBottom: 14 }}>
              <Spinner /><span style={{ fontSize: 12, color: "#a9bccf", flex: 1 }}>{st === "verifying" ? "Verifying…" : "Waiting for you to authorize in the browser…"}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="di-btn" onClick={cancel} style={{ flex: "0 0 auto", height: 44, padding: "0 16px", border: "1px solid var(--di-rule)", borderRadius: 11, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button className="di-btn" onClick={submit} disabled={busy || !code.trim()} style={{ ...authCta, height: 44, opacity: busy || !code.trim() ? 0.6 : 1 }}>Connect</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="di-btn" onClick={onSkip} style={{ flex: "0 0 auto", height: 44, padding: "0 16px", border: "1px solid var(--di-rule)", borderRadius: 11, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Skip for now</button>
            <button className="di-btn" onClick={start} disabled={busy} style={{ ...authCta, height: 44, opacity: busy ? 0.6 : 1 }}>{busy ? "Starting…" : "Begin"}<Icon name="arrow-up" size={15} color="#3a140a" style={{ transform: "rotate(90deg)" }} /></button>
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button className="di-btn" onClick={() => setManual(true)} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 11.5, color: "var(--di-ink-mute)" }}>Paste your own token instead</button>
        </div>
      </AuthCard>
    </SignalScene>
  );
}

function ManualToken({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [token, setTok] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.setClaudeToken(token.trim()); onDone(); } catch (e) { setErr(msg(e)); setBusy(false); }
  };
  return (
    <SignalScene>
      <AuthCard width={420}>
        <AuthHeader title="Use your own token" subtitle="Paste a token you minted elsewhere instead of the guided flow." />
        <div className="di-eyebrow" style={{ marginBottom: 8 }}>Anthropic token</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 14px", border: "1px solid var(--di-rule)", borderRadius: 11, background: "#0a1c2e", marginBottom: 9 }}>
          <Icon name="lock" size={16} color="var(--di-ink-mute)" />
          <input autoFocus type="password" value={token} onChange={(e) => setTok(e.target.value)} placeholder="sk-ant-…" spellCheck={false} className="di-mono"
            style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 13, letterSpacing: ".08em" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 20 }}>
          <Icon name="lock" size={13} color="var(--di-ink-mute)" /><span style={{ fontSize: 11, color: "#6f8296", lineHeight: 1.45 }}>Stored on your workspace volume, redacted from all task output.</span>
        </div>
        {err && <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, fontSize: 11.5, color: "var(--di-neg)" }}><Icon name="alert-triangle" size={13} />{err}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="di-btn" onClick={onBack} style={{ flex: "0 0 auto", height: 44, padding: "0 16px", border: "1px solid var(--di-rule)", borderRadius: 11, background: "transparent", color: "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Back</button>
          <button className="di-btn" onClick={save} disabled={busy || !token.trim()} style={{ ...authCta, height: 44, opacity: busy || !token.trim() ? 0.6 : 1 }}>Save token</button>
        </div>
      </AuthCard>
    </SignalScene>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span className="di-mono" style={{ width: 24, height: 24, flex: "0 0 auto", borderRadius: 999, background: "#12283f", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "var(--di-info)" }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--di-ink)", marginBottom: 7 }}>{label}</div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <span style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: 999, border: "2px solid var(--di-info)", borderTopColor: "transparent", display: "inline-block", animation: "di-spin 0.8s linear infinite" }} />;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
