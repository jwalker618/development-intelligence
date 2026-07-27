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
      {/* The session's own Claude Code detail leads: it is what someone opens
          Diagnostics to read. The DI health checks below are a different
          question (is the container provisioned) and can wait their turn. */}
      {sessionId && <ClaudeCodeDetail sessionId={sessionId} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, marginTop: 22 }}>
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
    </>
  );
}

/**
 * Claude Code, this session (46d).
 *
 * Designed to be READ IN A BUG REPORT. A label-value table cannot say "this is
 * the row that is wrong", so: a status glyph per row, healthy rows stay one
 * line, and anything amber or red expands with its explanation in place. The
 * stderr disclosure has a Copy all that produces the block a bug report needs.
 */
function ClaudeCodeDetail({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [diag, setDiag] = useState<ChatDiag | null>(null);
  const [showErr, setShowErr] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void api.chatStatus(sessionId, true).then(setStatus).catch(() => setStatus(null));
    void api.chatDiag(sessionId).then(setDiag).catch(() => setDiag(null));
  }, [sessionId]);

  const acct = status?.account;
  const cold = !status;
  const sig = status?.signals;

  const copyAll = () => {
    const block = [
      `session ${sessionId}`,
      `cli ${sig?.cliVersion ?? "unknown"}`,
      `account ${acct?.email ?? acct?.apiProvider ?? "unknown"}`,
      `costs ${status?.costsAreReal ? "billed" : "notional"}`,
      `settings ${(diag?.settingSources ?? []).join("+")}`,
      `inventory ${sig?.commands.length ?? 0} commands · ${sig?.skills.length ?? 0} skills · ${sig?.mcpServers.length ?? 0} mcp`,
      "",
      ...(diag?.stderr ?? []),
    ].join("\n");
    void navigator.clipboard?.writeText(block).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  };

  const errCount = (diag?.stderr ?? []).filter((l) => /error|fail|exit [1-9]/i.test(l)).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 9 }}>
        <Eb>Claude Code · this session</Eb>
        <span style={{ flex: 1 }} />
        <button className="di-btn" onClick={copyAll}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 11px", border: "1px solid var(--di-rule)", borderRadius: 8, background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>
          <Icon name={copied ? "check" : "copy"} size={12} color={copied ? "var(--di-pos)" : "var(--di-ink-mute)"} />{copied ? "Copied" : "Copy all"}
        </button>
      </div>

      <div style={{ border: "1px solid #24384f", borderRadius: 11, background: "#0c1e30", overflow: "hidden", marginBottom: 16 }}>
        <DiagRow tone={acct ? "ok" : "cold"} label="Connected as"
          value={acct?.email ?? (acct?.apiProvider ? `${acct.apiProvider} credentials` : "—")}
          detail={acct
            ? [acct.organization, acct.subscriptionType].filter(Boolean).join(" · ") || null
            : "Claude Code reports the account on its first turn."} />

        <DiagRow tone={status?.costsAreReal ? "ok" : cold ? "cold" : "warn"} label="Cost figures"
          value={cold ? "—" : status?.costsAreReal ? "Billed rates" : "Notional"}
          detail={cold ? null : status?.costsAreReal
            ? null
            : "You are on a subscription, so the SDK reports what the tokens would cost at API rates. Nothing here is billed."} />

        <DiagRow tone="warn" label="Settings loaded" value={(diag?.settingSources ?? []).join(" + ") || "—"}
          detail={diag?.settingSourcesNote ?? null} />

        <DiagRow tone={sig?.commands.length ? "ok" : "cold"} label="Inventory"
          value={sig?.commands.length
            ? `${sig.commands.length} commands · ${sig.skills.length} skills · ${sig.mcpServers.length} MCP servers`
            : "—"}
          detail={sig?.commands.length ? null : "Populated once Claude Code has started."} />

        <DiagRow tone={sig?.cliVersion ? "ok" : "cold"} label="CLI version" value={sig?.cliVersion ?? "—"} detail={null} last />
      </div>

      {/* Disclosure, not a wall — but the count is on the face so a broken
          session announces itself. */}
      {!!diag?.stderr.length && (
        <>
          <button className="di-btn" onClick={() => setShowErr((v) => !v)} aria-expanded={showErr}
            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "10px 13px", border: "1px solid #24384f", borderRadius: 10, background: "#0c1e30", cursor: "pointer", marginBottom: showErr ? 8 : 0 }}>
            <Icon name={showErr ? "chevron-down" : "chevron-right"} size={13} color="var(--di-ink-mute)" />
            <span style={{ flex: 1, textAlign: "left", fontSize: 12, color: "var(--di-ink-soft)" }}>CLI stderr</span>
            <span className="di-mono" style={{ fontSize: 10.5, color: errCount ? "var(--di-neg)" : "#6f8296" }}>
              {errCount ? `${errCount} error${errCount === 1 ? "" : "s"} · ` : ""}last {diag.stderr.length} lines
            </span>
          </button>
          {showErr && (
            <div className="di-mono di-scroll" style={{ border: "1px solid #22384a", borderRadius: 10, background: "#0b1622", padding: "11px 13px", fontSize: 10.5, lineHeight: 1.75, maxHeight: 220, overflowY: "auto" }}>
              {diag.stderr.map((l, i) => (
                <div key={i} style={{ color: /error|fail|exit [1-9]/i.test(l) ? "#e79b9b" : "#8fa6b5", whiteSpace: "pre-wrap" }}>{l}</div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** One diagnostics row. Healthy stays one line; anything else earns a sentence
 *  in place, so the shape of the answer is visible before the answer is. */
function DiagRow({ tone, label, value, detail, last }: {
  tone: "ok" | "warn" | "bad" | "cold"; label: string; value: string; detail: string | null; last?: boolean;
}) {
  const glyph = tone === "ok" ? "check-circle-2" : tone === "bad" ? "alert-octagon" : tone === "warn" ? "info" : "circle";
  const colour = tone === "ok" ? "var(--di-pos)" : tone === "bad" ? "var(--di-neg)" : tone === "warn" ? "var(--di-warn)" : "#3e5670";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 13px", borderBottom: last ? 0 : "1px solid #14283c" }}>
      <Icon name={glyph} size={14} color={colour} style={{ flex: "0 0 auto", marginTop: 1 }} />
      <div style={{ flex: "0 0 132px", fontSize: 12, color: "var(--di-ink-soft)" }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="di-mono" style={{ fontSize: 11.5, color: value === "—" ? "#3e5670" : "var(--di-ink)", wordBreak: "break-word" }}>{value}</div>
        {detail && <div style={{ fontSize: 10.5, color: "#6f8296", lineHeight: 1.5, marginTop: 4 }}>{detail}</div>}
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
