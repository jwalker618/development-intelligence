import { Check, Copy, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ClaudeAuthStatus } from "../api";
import { Sheet } from "../ui";

/**
 * Guided Claude connect (field ruling): the whole subscription login lives in
 * this one procedural modal. The server runs `claude setup-token` in a hidden
 * PTY and Grotto walks three steps — open the authorize link, paste the code
 * into a normal form field, done. The terminal is never involved, so nothing
 * can wrap, truncate, or refuse to paste. The minted token is stored
 * write-only on the volume and injected into every future session.
 */
export function ClaudeConnect({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone?: () => void;
}) {
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const doneNotified = useRef(false);

  // Resume a flow that's mid-authorization (URL and code are paired — a
  // restart would invalidate a code the user already has); start fresh
  // otherwise.
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = await api.claudeAuth().catch(() => null);
      if (!live) return;
      if (s && (s.state === "awaiting-code" || s.state === "verifying")) setStatus(s);
      else setStatus(await api.claudeAuthStart().catch(() => null));
    })();
    return () => {
      live = false;
    };
  }, []);

  // Poll while the flow is in motion.
  const state = status?.state ?? "starting";
  useEffect(() => {
    if (state === "done" || state === "error") return;
    const t = setInterval(() => {
      void api.claudeAuth().then(setStatus).catch(() => undefined);
    }, 1200);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => {
    if (state === "done" && !doneNotified.current) {
      doneNotified.current = true;
      onDone?.();
    }
  }, [state, onDone]);

  const url = status?.url ?? null;
  const stepNow = state === "done" ? 3 : url && state !== "starting" ? 2 : 1;

  const startOver = async () => {
    setCode("");
    setStatus(null);
    doneNotified.current = false;
    await api.claudeAuthCancel().catch(() => undefined);
    setStatus(await api.claudeAuthStart().catch(() => null));
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>
          <KeyRound size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Connect Claude
        </h2>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        Signs Development Intelligence into your Claude subscription. One time — it survives redeploys.
      </p>

      {/* 1 · Authorize */}
      <div className={stepClass(1, stepNow)}>
        <span className="step-num">{stepNow > 1 ? <Check size={13} /> : "1"}</span>
        <div className="step-body">
          <div className="step-title">Authorize on claude.ai</div>
          {url ? (
            <div className="btn-row">
              <button
                className="btn primary"
                style={{ flex: 1 }}
                onClick={() => window.open(url, "_blank", "noopener")}
              >
                <ExternalLink size={14} /> Open claude.ai
              </button>
              <button
                className="icon-btn"
                title="Copy the sign-in link"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={14} style={{ color: "var(--ok-check)" }} /> : <Copy size={14} />}
              </button>
            </div>
          ) : state === "error" ? (
            <p className="muted">Couldn't get a sign-in link.</p>
          ) : (
            <p className="muted">Getting your sign-in link…</p>
          )}
          {stepNow === 1 && url === null && state !== "error" && (
            <p className="microcopy">Sign in with the Claude account that has your subscription.</p>
          )}
        </div>
      </div>

      {/* 2 · Return code */}
      <div className={stepClass(2, stepNow)}>
        <span className="step-num">{stepNow > 2 ? <Check size={13} /> : "2"}</span>
        <div className="step-body">
          <div className="step-title">Paste the code you get back</div>
          {stepNow === 2 && (
            <>
              <input
                className="code-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="paste authorization code…"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className="btn primary wide"
                disabled={code.trim().length < 4 || state === "verifying"}
                onClick={() => {
                  void api
                    .claudeAuthCode(code)
                    .then(setStatus)
                    .catch(() => undefined);
                }}
              >
                {state === "verifying" ? "Connecting…" : "Connect"}
              </button>
              {state === "verifying" && (
                <p className="microcopy">Exchanging the code for a long-lived token…</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3 · Done */}
      <div className={stepClass(3, stepNow)}>
        <span className="step-num">{state === "done" ? <Check size={13} /> : "3"}</span>
        <div className="step-body">
          <div className="step-title">Connected</div>
          {state === "done" && (
            <>
              <p className="muted">
                Token stored. Every session — current and future — is now signed in.
                Run <span className="mono-inline">claude</span> and go.
              </p>
              <button className="btn primary wide" onClick={onClose}>
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {state === "error" && (
        <>
          <div className="error">{status?.detail ?? "something went wrong"}</div>
          {status?.tail && (
            <>
              <button className="btn ghost" onClick={() => setShowOutput((o) => !o)}>
                {showOutput ? "Hide CLI output" : "Show CLI output"}
              </button>
              {showOutput && <pre className="git-output">{status.tail}</pre>}
            </>
          )}
          <button className="btn primary wide" onClick={() => void startOver()}>
            <RefreshCw size={14} /> Start over
          </button>
        </>
      )}
    </Sheet>
  );
}

function stepClass(step: number, now: number): string {
  if (step < now) return "connect-step done";
  if (step === now) return "connect-step active";
  return "connect-step";
}
