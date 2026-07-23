import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { type ThemePref } from "../ui";
import { ClaudeConnect } from "./ClaudeConnect";
import { Otp } from "./Otp";

interface Props {
  onBack: () => void;
  onLogout: () => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
}

/** Settings (design 5b): Claude auth, Security/MFA, Appearance, Sign out. */
export function SettingsScreen({ onBack, onLogout, themePref, setThemePref }: Props) {
  const [view, setView] = useState<"main" | "enroll">("main");
  const [error, setError] = useState<string | null>(null);

  const [authSource, setAuthSource] = useState<"grotto" | "env" | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [secOpen, setSecOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauth: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [auth, mfa] = await Promise.all([
      api.claudeToken().catch(() => ({ source: null as null })),
      api.mfa().catch(() => ({ enabled: false })),
    ]);
    setAuthSource(auth.source);
    setMfaEnabled(mfa.enabled);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Groups the manual secret like `K5RA WYLZ 7Q2M 4T6N`. */
  const grouped = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

  if (view === "enroll" && enrollment) {
    return (
      <div className="page">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setView("main")}>
            <ChevronLeft size={18} />
          </button>
          <span className="brand" style={{ fontSize: 16 }}>
            Two-factor
          </span>
        </header>
        <main className="scroll">
          {error && <div className="error">{error}</div>}
          <div className="card" style={{ alignItems: "center", textAlign: "center", gap: 12 }}>
            <span className="tile">
              <ShieldCheck size={24} />
            </span>
            <h2 style={{ fontSize: 18 }}>Turn on two-factor</h2>
            <p className="muted" style={{ maxWidth: 270 }}>
              With two-factor on, the master token can't sign in on its own — every new
              device also needs a 6-digit code from your authenticator.
            </p>
            <a className="btn primary wide" href={enrollment.otpauth}>
              <ExternalLink size={15} /> Open in Authenticator
            </a>
            <p className="microcopy">Adds Development Intelligence to your authenticator app.</p>
            <div className="eyebrow">or enter the key</div>
            <div className="dashed-secret">
              <span className="num">{grouped(enrollment.secret)}</span>
              <button
                className="icon-btn"
                onClick={() => void navigator.clipboard?.writeText(enrollment.secret)}
                title="Copy secret"
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="eyebrow" style={{ marginTop: 4 }}>
              Enter the code to confirm
            </div>
            <Otp value={confirmCode} onChange={setConfirmCode} autoFocus />
            <button
              className="btn primary wide"
              disabled={busy || confirmCode.length !== 6}
              onClick={() =>
                void act(async () => {
                  await api.mfaEnable(confirmCode);
                  setEnrollment(null);
                  setConfirmCode("");
                  setView("main");
                })
              }
            >
              Turn on two-factor
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}>
          <ChevronLeft size={18} />
        </button>
        <span className="brand" style={{ fontSize: 16 }}>
          Settings
        </span>
      </header>
      <main className="scroll">
        {error && <div className="error">{error}</div>}

        {/* Claude authentication */}
        <div className="card">
          <button className="row card-toggle" onClick={() => setAuthOpen((o) => !o)}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Claude authentication</span>
            <span className="status-line">
              {authSource && <Check size={12} style={{ color: "var(--ok-check)" }} />}
              {authSource === "grotto"
                ? "Long-lived token stored · from setup-token"
                : authSource === "env"
                  ? "Token from environment"
                  : "Interactive login (or none)"}
            </span>
            {authOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {authOpen && (
            <div className="card-body pillup">
              <button className="btn primary wide" onClick={() => setConnectOpen(true)}>
                <KeyRound size={15} />
                {authSource ? "Reconnect Claude (guided)" : "Connect Claude (guided)"}
              </button>
              <p className="microcopy">
                Walks the authorize-link + code steps in one place — no terminal involved.
              </p>
              <div className="eyebrow">Or paste a token manually</div>
              <label className="login-field settings-field">
                <Lock size={14} />
                <input
                  type="password"
                  placeholder="Paste claude setup-token…"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                />
              </label>
              <div className="btn-row">
                <button
                  className="btn primary"
                  disabled={busy || !tokenDraft.trim()}
                  onClick={() =>
                    void act(async () => {
                      await api.setClaudeToken(tokenDraft.trim());
                      setTokenDraft("");
                    })
                  }
                >
                  Save token
                </button>
                {authSource === "grotto" && (
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => void act(() => api.clearClaudeToken())}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="microcopy">
                Stored write-only — the server shows that a token is present, never its value.
              </p>
            </div>
          )}
        </div>

        {/* Security */}
        <div className="card">
          <button className="row card-toggle" onClick={() => setSecOpen((o) => !o)}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Security</span>
            <span className="status-line">
              {mfaEnabled ? (
                <>
                  <Check size={12} style={{ color: "var(--ok-check)" }} /> Authenticator MFA on
                </>
              ) : (
                <>
                  <span className="dot idle" /> Two-factor off
                </>
              )}
            </span>
            <span style={{ color: "var(--accent-ink)", fontSize: 12.5, fontWeight: 600 }}>
              Manage
            </span>
            {secOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {secOpen && (
            <div className="card-body pillup">
              {!mfaEnabled ? (
                <button
                  className="btn outline"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      setEnrollment(await api.mfaSetup());
                      setConfirmCode("");
                      setView("enroll");
                    })
                  }
                >
                  <ShieldCheck size={15} /> Turn on two-factor
                </button>
              ) : (
                <>
                  <p className="muted">
                    Turning two-factor off requires a current code from your authenticator.
                  </p>
                  <Otp value={disableCode} onChange={setDisableCode} />
                  <button
                    className="btn danger"
                    disabled={busy || disableCode.length !== 6}
                    onClick={() =>
                      void act(async () => {
                        await api.mfaDisable(disableCode);
                        setDisableCode("");
                      })
                    }
                  >
                    Turn off two-factor
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Diagnostics */}
        <Diagnostics />

        {/* Appearance */}
        <div className="card">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Appearance</span>
          <div className="seg3">
            {(["system", "light", "dark"] as const).map((p) => (
              <button
                key={p}
                className={themePref === p ? "seg3-opt active" : "seg3-opt"}
                onClick={() => setThemePref(p)}
              >
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <button
          className="btn wide"
          style={{ color: "var(--danger)" }}
          onClick={async () => {
            await api.logout().catch(() => undefined);
            onLogout();
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
        <p className="microcopy" style={{ textAlign: "center" }}>
          Revokes this device's 30-day credential.
        </p>
      </main>
      {connectOpen && (
        <ClaudeConnect onClose={() => setConnectOpen(false)} onDone={() => void refresh()} />
      )}
    </div>
  );
}

/**
 * Environment health: what's installed, wired, and active — with a one-tap
 * Repair that re-runs provisioning (caveman --with-hooks --with-rtk + the
 * statusline wiring) and shows the raw output.
 */
function Diagnostics() {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<
    Array<{ id: string; label: string; ok: boolean; detail: string }>
  >([]);
  const [repairOut, setRepairOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setChecks((await api.doctor()).checks);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const failing = checks.filter((c) => !c.ok).length;

  return (
    <div className="card">
      <button
        className="row card-toggle"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Diagnostics</span>
        <span className="status-line">
          <Stethoscope size={12} />
          {checks.length === 0
            ? "environment health checks"
            : failing === 0
              ? "all checks passing"
              : `${failing} failing`}
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="card-body pillup">
          {error && <div className="error">{error}</div>}
          {checks.map((c) => (
            <div key={c.id} className="row" style={{ fontSize: 13, alignItems: "flex-start" }}>
              {c.ok ? (
                <Check size={14} style={{ color: "var(--ok-check)", marginTop: 2 }} />
              ) : (
                <X size={14} style={{ color: "var(--danger)", marginTop: 2 }} />
              )}
              <span style={{ minWidth: 0 }}>
                {c.label}
                <div className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)" }}>
                  {c.detail}
                </div>
              </span>
            </div>
          ))}
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setRepairOut(null);
                try {
                  setRepairOut((await api.repair()).output);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Repairing…" : "Repair (reinstall caveman + RTK)"}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => void load()}>
              Re-check
            </button>
          </div>
          {repairOut && <pre className="git-output">{repairOut}</pre>}
        </div>
      )}
    </div>
  );
}
