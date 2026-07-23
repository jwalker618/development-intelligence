import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AuthError, login } from "../api";
import { CaveMark } from "../ui";
import { Otp } from "./Otp";

/** Receding cave-arch tunnel behind the login card (option 5a). */
function Arches() {
  const arches: Array<[number, number]> = [
    [0.14, 1.4],
    [0.1, 1.3],
    [0.07, 1.2],
    [0.05, 1.1],
  ];
  return (
    <svg className="login-arches" viewBox="0 0 400 800" preserveAspectRatio="xMidYMax slice">
      {arches.map(([opacity, width], i) => {
        const s = 1 + i * 0.55;
        return (
          <path
            key={i}
            d="M140 800 L140 720 Q140 620 200 620 Q260 620 260 720 L260 800"
            fill="none"
            stroke="#f97316"
            strokeWidth={width}
            opacity={opacity}
            transform={`translate(${200 - 200 * s} ${800 - 800 * s}) scale(${s})`}
          />
        );
      })}
    </svg>
  );
}

type Step = "token" | "code" | "throttle";

/**
 * Two-step MFA login (design 5a): master token → (if MFA on) authenticator
 * code, exchanged for a revocable 30-day device credential. Only the
 * credential persists on the device. The code step is a continuation, not an
 * error; throttling counts down the server's retryAfter.
 */
export function Login({ onSave }: { onSave: (credential: string) => void }) {
  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [retryLeft, setRetryLeft] = useState(0);
  const [flash, setFlash] = useState(false);

  // Throttle countdown; when it hits zero, unlock back to the code step.
  useEffect(() => {
    if (step !== "throttle") return;
    const t = setInterval(() => {
      setRetryLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setStep(token ? "code" : "token");
          setError(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step, token]);

  const submit = async (codeValue?: string) => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await login(token.trim(), codeValue ?? (step === "code" ? code : undefined));
      if (r.mfaRequired) {
        setStep("code");
        setCode("");
      } else if (r.credential) {
        onSave(r.credential);
      }
    } catch (e) {
      if (e instanceof AuthError && e.status === 429) {
        setRetryLeft(e.retryAfter ?? 60);
        setStep("throttle");
        setCode("");
      } else if (e instanceof AuthError && step === "code") {
        setError("Incorrect code");
        setAttemptsLeft(e.attemptsLeft ?? null);
        setCode("");
        setFlash(true);
        setTimeout(() => setFlash(false), 500);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (step === "token") {
    return (
      <div className="login">
        <Arches />
        <div className="login-card">
          <CaveMark size={76} className="login-mark" />
          <h1>Development Intelligence</h1>
          <p className="muted">
            Agent-first development. Paste the token printed by the server.
          </p>
          <label className="login-field">
            <Lock size={15} />
            <input
              type="password"
              placeholder="server token"
              value={token}
              autoFocus
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button
            className="btn primary"
            disabled={busy || !token.trim()}
            onClick={() => void submit()}
          >
            {busy ? "Checking…" : "Enter the cave"}
            {!busy && <ArrowRight size={16} />}
          </button>
          <p className="microcopy">
            <ShieldCheck size={13} /> This device stays signed in for 30 days.
          </p>
        </div>
      </div>
    );
  }

  if (step === "throttle") {
    return (
      <div className="login">
        <div className="login-card pillup">
          <span className="tile danger">
            <Clock size={24} />
          </span>
          <h2 className="login-title">Too many attempts</h2>
          <p className="muted">
            Codes are paused briefly to keep the cave safe. Try again shortly.
          </p>
          <div style={{ opacity: 0.4, pointerEvents: "none" }}>
            <Otp value="" onChange={() => undefined} disabled />
          </div>
          <div className="danger-soft">
            <Clock size={14} />
            Try again in <strong className="num">{mmss(retryLeft)}</strong>
          </div>
          <button className="btn" disabled>
            Verify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <button className="login-back" onClick={() => setStep("token")}>
        <ChevronLeft size={16} /> Back
      </button>
      <div className="login-card pillup">
        <span className="tile">
          <Lock size={24} />
        </span>
        <h2 className="login-title">Check your authenticator</h2>
        <p className="muted">
          Enter the 6-digit code for Development Intelligence from your authenticator app.
        </p>
        <Otp
          value={code}
          onChange={setCode}
          onComplete={(v) => void submit(v)}
          error={flash}
          autoFocus
        />
        {error && (
          <div className="danger-soft">
            {error}
            {attemptsLeft !== null ? ` — ${attemptsLeft} attempts left` : ""}
          </div>
        )}
        <button
          className="btn primary"
          disabled={busy || code.length !== 6}
          onClick={() => void submit()}
        >
          {busy ? "Verifying…" : "Verify"}
          {!busy && <Check size={16} />}
        </button>
        <p className="microcopy">
          <RefreshCw size={12} /> Codes refresh every 30 seconds.
        </p>
      </div>
    </div>
  );
}
