import { useEffect, useState } from "react";
import { api, clearToken, type ChatDiag, type ChatStatus } from "../../api";
import { Icon } from "../primitives";
import { THEMES, type Theme } from "../state";

type Section = "claude" | "security" | "diagnostics" | "appearance";
const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "claude", label: "Claude authentication", icon: "lock" },
  { id: "security", label: "Security", icon: "shield-alert" },
  { id: "diagnostics", label: "Diagnostics", icon: "loader" },
  { id: "appearance", label: "Appearance", icon: "rotate-cw" },
];

/** Settings — one modal, four sections (39a-e). Opened from the nav gear.
 *  Wired to /api/claude-token, /api/claude-auth, /api/mfa/*, /api/doctor,
 *  /api/doctor/repair, and the theme. Reconnect routes back to Connect Claude. */
export function Settings({ onClose, onReconnect, onSignOut, theme, onTheme, sessionId }: {
  onClose: () => void; onReconnect: () => void; onSignOut: () => void; theme: Theme; onTheme: (t: Theme) => void;
  /** The open session, when there is one — the CLI-level diagnostics below are
   *  per-session (each has its own Claude Code subprocess). */
  sessionId?: string | null;
}) {
  const [section, setSection] = useState<Section>("claude");
  return (
    <div className="di-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,10,18,.66)" }}>
      <div className="di-menu" style={{ width: 900, maxWidth: "calc(100% - 40px)", height: 552, maxHeight: "calc(100% - 40px)", border: "1px solid var(--di-rule)", borderRadius: 16, background: "#0a1a2a", boxShadow: "0 40px 90px -20px rgba(0,0,0,.85)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 11, padding: "16px 20px", borderBottom: "1px solid #17293a" }}>
          <Icon name="settings" size={16} color="var(--di-ink-mute)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--di-ink)", flex: 1 }}>Settings</span>
          <button className="di-btn" onClick={onClose} aria-label="Close" style={{ border: 0, background: "transparent", cursor: "pointer", display: "flex" }}><Icon name="x" size={17} color="var(--di-ink-mute)" /></button>
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: "0 0 216px", borderRight: "1px solid #17293a", padding: "14px 12px" }}>
            {SECTIONS.map((s) => {
              const active = s.id === section;
              return (
                <button key={s.id} className="di-btn" onClick={() => setSection(s.id)}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 9, marginBottom: 3, cursor: "pointer", border: 0, background: active ? "#12283f" : "transparent", overflow: "hidden" }}>
                  {active && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--di-spot)" }} />}
                  <Icon name={s.icon} size={15} color={active ? "var(--di-spot)" : "var(--di-ink-mute)"} />
                  <span style={{ fontSize: 12.5, color: active ? "var(--di-ink)" : "var(--di-ink-soft)" }}>{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="di-scroll" style={{ flex: 1, padding: "22px 24px" }}>
            {section === "claude" && <ClaudeSection onReconnect={onReconnect} />}
            {section === "security" && <SecuritySection onSignOut={onSignOut} />}
            {section === "diagnostics" && <DiagnosticsSection sessionId={sessionId ?? null} />}
            {section === "appearance" && <AppearanceSection theme={theme} onTheme={onTheme} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 15, fontWeight: 600, color: "var(--di-ink)", marginBottom: 18 }}>{children}</div>; }
function Eb({ children }: { children: React.ReactNode }) { return <div className="di-eyebrow" style={{ marginBottom: 12 }}>{children}</div>; }

function ClaudeSection({ onReconnect }: { onReconnect: () => void }) {
  const [source, setSource] = useState<string | null | undefined>(undefined);
  useEffect(() => { void api.claudeToken().then((r) => setSource(r.source)).catch(() => setSource(null)); }, []);
  const connected = !!source;
  return (
    <>
      <H>Claude authentication</H>
      <div style={{ border: "1px solid #24384f", borderRadius: 12, background: "#0c1e30", padding: "15px 16px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13, paddingBottom: 13, borderBottom: "1px solid #17293a" }}>
          <Icon name="lock" size={16} color={connected ? "var(--di-pos)" : "var(--di-ink-mute)"} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "var(--di-ink)" }}>{connected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 11, color: "#6f8296" }}>{source === "env" ? "via ANTHROPIC_API_KEY" : source === "grotto" ? "subscription token on volume" : "Claude Code can't run yet"}</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: 999, background: connected ? "#0d2417" : "#1a1206", border: `1px solid ${connected ? "#234a2e" : "#5a3316"}`, fontSize: 10.5, color: connected ? "var(--di-pos)" : "var(--di-warn)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: connected ? "var(--di-pos)" : "var(--di-warn)" }} />{connected ? "connected" : "off"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="di-btn" onClick={onReconnect} style={{ height: 36, padding: "0 14px", border: "1px solid var(--di-rule)", borderRadius: 9, background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="rotate-cw" size={13} />{connected ? "Reconnect" : "Connect Claude"}</button>
          {connected && <button className="di-btn" onClick={() => { void api.clearClaudeToken().then(() => setSource(null)); }} style={{ height: 36, padding: "0 14px", border: "1px solid #3a2020", borderRadius: 9, background: "transparent", color: "var(--di-neg)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Disconnect</button>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="lock" size={13} color="var(--di-ink-mute)" /><span style={{ fontSize: 11, color: "#6f8296" }}>Stored on your workspace volume · redacted from all task output.</span>
      </div>
    </>
  );
}

function SecuritySection({ onSignOut }: { onSignOut: () => void }) {
  const [mfa, setMfa] = useState<boolean | null>(null);
  useEffect(() => { void api.mfa().then((r) => setMfa(r.enabled)).catch(() => setMfa(false)); }, []);
  return (
    <>
      <H>Security</H>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", border: `1px solid ${mfa ? "#234a2e" : "#5a3316"}`, borderRadius: 12, background: mfa ? "#0d2417" : "#1a1206", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Icon name="shield-alert" size={18} color={mfa ? "var(--di-pos)" : "var(--di-warn)"} />
          <div><div style={{ fontSize: 13, color: "var(--di-ink)" }}>Two-factor authentication</div><div style={{ fontSize: 11, color: mfa ? "#8fbfa0" : "#e0b06a" }}>{mfa === null ? "checking…" : mfa ? "Enabled · authenticator app" : "Off — enable to require a code at sign-in"}</div></div>
        </div>
        <button className="di-btn" onClick={() => { if (mfa) { const c = prompt("Enter a current 6-digit code to disable 2FA"); if (c) void api.mfaDisable(c).then(() => setMfa(false)).catch((e) => alert(e.message)); } else alert("2FA enrolment (QR + confirm) — 39c."); }}
          style={{ height: 34, padding: "0 13px", border: `1px solid ${mfa ? "#3a2020" : "var(--di-rule)"}`, borderRadius: 9, background: "transparent", color: mfa ? "var(--di-neg)" : "var(--di-info)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{mfa ? "Disable" : "Enable"}</button>
      </div>
      <Eb>Device credentials</Eb>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", border: "1px solid #24384f", borderRadius: 10, background: "#0c1e30", marginBottom: 18 }}>
        <Icon name="monitor" size={16} color="var(--di-pos)" />
        <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "var(--di-ink)" }}>This browser <span style={{ color: "var(--di-pos)", fontSize: 10.5 }}>· current</span></div><div style={{ fontSize: 10.5, color: "#6f8296" }}>30-day revocable device credential</div></div>
      </div>
      <div style={{ paddingTop: 18, borderTop: "1px solid #17293a", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, color: "var(--di-ink)", marginBottom: 2 }}>Sign out of this browser</div><div style={{ fontSize: 11, color: "#6f8296" }}>Revokes this device credential. Running sessions keep going.</div></div>
        <button className="di-btn" onClick={() => { void api.logout().catch(() => undefined); clearToken(); onSignOut(); }} style={{ height: 40, padding: "0 16px", border: "1px solid #3a2020", borderRadius: 10, background: "transparent", color: "var(--di-neg)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="arrow-up-left" size={14} />Sign out</button>
      </div>
    </>
  );
}

function DiagnosticsSection({ sessionId }: { sessionId: string | null }) {
  const [checks, setChecks] = useState<Array<{ id: string; label: string; ok: boolean; detail: string }> | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { void api.doctor().then((r) => setChecks(r.checks)).catch(() => setChecks([])); };
  useEffect(load, []);
  const repair = () => { setBusy(true); void api.repair().then((r) => { setOutput(r.output); load(); }).catch((e) => setOutput(e.message)).finally(() => setBusy(false)); };
  const issues = checks?.filter((c) => !c.ok).length ?? 0;
  return (
    <>
      <H>Diagnostics</H>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 11px", borderRadius: 999, background: issues ? "#1a1206" : "#0d2417", border: `1px solid ${issues ? "#5a3316" : "#234a2e"}`, fontSize: 11, color: issues ? "var(--di-warn)" : "var(--di-pos)" }}>
          <Icon name={issues ? "alert-triangle" : "check-circle-2"} size={12} />{checks === null ? "checking…" : issues ? `${issues} issue${issues > 1 ? "s" : ""} found` : "all healthy"}
        </span>
        <span style={{ flex: 1 }} />
        <button className="di-btn" onClick={repair} disabled={busy} style={{ height: 34, padding: "0 14px", border: 0, borderRadius: 9, background: "var(--di-spot)", color: "#3a140a", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: busy ? 0.6 : 1 }}><Icon name="rotate-cw" size={13} />{busy ? "Repairing…" : "Repair"}</button>
      </div>
      <div style={{ border: "1px solid #24384f", borderRadius: 11, background: "#0c1e30", overflow: "hidden", marginBottom: 16 }}>
        {(checks ?? []).map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderBottom: "1px solid #14283c" }}>
            <Icon name={c.ok ? "check-circle-2" : "alert-octagon"} size={16} color={c.ok ? "var(--di-pos)" : "var(--di-neg)"} />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, color: "var(--di-ink)" }}>{c.label}</div><div className="di-mono" style={{ fontSize: 10.5, color: "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.detail}</div></div>
            <span className="di-mono" style={{ fontSize: 10.5, color: c.ok ? "var(--di-pos)" : "var(--di-neg)" }}>{c.ok ? "ok" : "fail"}</span>
          </div>
        ))}
        {checks === null && <div style={{ padding: 14, color: "var(--di-ink-mute)", fontSize: 12 }}>Loading checks…</div>}
      </div>
      {output && (<><Eb>Repair output</Eb><div className="di-mono" style={{ border: "1px solid #22384a", borderRadius: 10, background: "#0b1622", padding: "11px 13px", fontSize: 11, lineHeight: 1.7, color: "#8fa6b5", whiteSpace: "pre-wrap" }}>{output}</div></>)}
      {sessionId && <ClaudeCodeDetail sessionId={sessionId} />}
    </>
  );
}

/**
 * CLI-process detail for the open session: who the agent is authenticated as,
 * which settings sources load (and which deliberately do not), what the CLI
 * says it has available, and its own stderr. Before this, a misbehaving session
 * gave DI nothing to show.
 */
function ClaudeCodeDetail({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [diag, setDiag] = useState<ChatDiag | null>(null);
  useEffect(() => {
    void api.chatStatus(sessionId, true).then(setStatus).catch(() => setStatus(null));
    void api.chatDiag(sessionId).then(setDiag).catch(() => setDiag(null));
  }, [sessionId]);

  const acct = status?.account;
  return (
    <>
      <Eb>Claude Code · this session</Eb>
      <div style={{ border: "1px solid #24384f", borderRadius: 11, background: "#0c1e30", overflow: "hidden", marginBottom: 16 }}>
        <Row label="Connected as"
          value={acct?.email ?? (acct?.apiProvider ? `${acct.apiProvider} credentials` : "not started yet")}
          sub={[acct?.organization, acct?.subscriptionType].filter(Boolean).join(" · ") || null} />
        <Row label="Cost figures"
          value={status?.costsAreReal ? "billed rates" : "notional"}
          sub={status?.costsAreReal ? null : "Subscription and 3P-provider sessions report costs as if billed at API rates."} />
        <Row label="Settings sources"
          value={(diag?.settingSources ?? []).join(" + ") || "—"}
          sub={diag?.settingSourcesNote ?? null} />
        <Row label="Slash commands" value={String(status?.signals.commands.length ?? 0)} sub={null} />
        <Row label="Skills" value={String(status?.signals.skills.length ?? 0)} sub={null} />
        <Row label="MCP servers"
          value={status?.signals.mcpServers.length ? status.signals.mcpServers.map((m) => `${m.name}:${m.status}`).join(", ") : "none"}
          sub="A cloned repo's .mcp.json is never auto-connected (strictMcpConfig)." />
        <Row label="CLI version" value={status?.signals.cliVersion ?? "—"} sub={null} />
      </div>
      {!!diag?.stderr.length && (
        <>
          <Eb>Claude Code stderr · last {diag.stderr.length} lines</Eb>
          <div className="di-mono" style={{ border: "1px solid #22384a", borderRadius: 10, background: "#0b1622", padding: "11px 13px", fontSize: 10.5, lineHeight: 1.7, color: "#8fa6b5", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>
            {diag.stderr.join("\n")}
          </div>
        </>
      )}
    </>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 13px", borderBottom: "1px solid #14283c" }}>
      <div style={{ flex: "0 0 150px", fontSize: 12, color: "var(--di-ink-soft)" }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="di-mono" style={{ fontSize: 11.5, color: "var(--di-ink)", wordBreak: "break-word" }}>{value}</div>
        {sub && <div style={{ fontSize: 10.5, color: "#6f8296", lineHeight: 1.45, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

function AppearanceSection({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  return (
    <>
      <H>Appearance</H>
      <Eb>Theme mode</Eb>
      <div style={{ display: "flex", gap: 5, padding: 4, border: "1px solid var(--di-rule)", borderRadius: 11, background: "#0b1826", marginBottom: 22 }}>
        {["Dark", "Light", "System"].map((m, i) => (
          <button key={m} className="di-btn" disabled={i > 0} title={i > 0 ? "Dark-first for v1" : undefined}
            style={{ flex: 1, height: 40, border: 0, borderRadius: 9, background: i === 0 ? "#12283f" : "transparent", color: i === 0 ? "var(--di-ink)" : "var(--di-ink-mute)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: i === 0 ? "default" : "not-allowed", opacity: i > 0 ? 0.5 : 1 }}>{m}</button>
        ))}
      </div>
      <Eb>Rail colour</Eb>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <button key={t.id} className="di-btn" onClick={() => onTheme(t.id)}
              style={{ position: "relative", border: `1px solid ${active ? "#3e6794" : "#24384f"}`, borderRadius: 12, background: "#0c1e30", overflow: "hidden", cursor: "pointer", boxShadow: active ? "0 0 0 2px rgba(240,146,110,.3)" : "none", padding: 0, textAlign: "left" }}>
              <div style={{ height: 42, background: t.swatch, position: "relative" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px" }}>
                <span style={{ fontSize: 12, color: "var(--di-ink)", flex: 1 }}>{t.label}</span>
                {active && <Icon name="check" size={14} color="var(--di-spot)" />}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16 }}>
        <Icon name="lock" size={13} color="var(--di-ink-mute)" /><span style={{ fontSize: 11, color: "#6f8296" }}>The coral nav, primary actions and keep/revert colours stay constant across every theme.</span>
      </div>
    </>
  );
}
