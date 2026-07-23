import { ChevronLeft, GitBranch, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type GitLogEntry, type GitStatus } from "../api";

export function Git({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [history, setHistory] = useState<GitLogEntry[]>([]);
  const [diff, setDiff] = useState<{ path: string | null; text: string } | null>(null);
  const [message, setMessage] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [st, log] = await Promise.all([
        api.gitStatus(sessionId),
        api.gitLog(sessionId).catch(() => ({ entries: [] as GitLogEntry[] })),
      ]);
      setStatus(st);
      setHistory(log.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (
    op: string,
    extra?: { message?: string; branch?: string; sha?: string },
  ) => {
    setBusy(op);
    setError(null);
    try {
      const r = await api.gitOp(sessionId, { op, ...extra });
      setOutput(r.output);
      if (op === "commit" || op === "sync") setMessage("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const revertTo = (entry: GitLogEntry) => {
    if (
      window.confirm(
        `Reset workspace to ${entry.sha} — "${entry.subject}"?\n\n` +
          "Uncommitted changes are lost. If the branch was already pushed past this " +
          "point, the next push needs --force-with-lease from the Agent tab.",
      )
    ) {
      void run("reset", { sha: entry.sha });
    }
  };

  if (diff) {
    return (
      <div className="card">
        <div className="review-head">
          <button className="icon-btn" onClick={() => setDiff(null)}>
            <ChevronLeft size={17} />
          </button>
          <span className="path">{diff.path ?? "all changes"}</span>
        </div>
        <pre className="diff">
          {diff.text.split("\n").map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("+") && !line.startsWith("+++")
                  ? "diff-add"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "diff-del"
                    : line.startsWith("@@")
                      ? "diff-hunk"
                      : undefined
              }
            >
              {line || " "}
            </div>
          ))}
        </pre>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="git-head">
        <GitBranch size={15} style={{ color: "var(--accent-ink)" }} />
        <span className="branch">{status?.branch ?? "…"}</span>
        <span className="muted num">
          {status ? `↑${status.ahead} ↓${status.behind}` : ""}
        </span>
        <button className="icon-btn" onClick={() => void refresh()} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {status?.entries.length === 0 && <p className="muted">Working tree clean.</p>}
      {status?.entries.map((e) => (
        <div key={e.path} className="file-item">
          <button className="file-row" onClick={() => void setDiffFor(e.path)}>
            <code className={`git-xy ${e.status === "??" ? "new" : "mod"}`}>{e.status}</code>
            {e.path}
          </button>
        </div>
      ))}
      {status && status.entries.length > 0 && (
        <button className="btn ghost" onClick={() => void setDiffFor(null)}>
          View full diff
        </button>
      )}

      <div className="commit-box">
        <button
          className="btn primary wide"
          disabled={busy !== null}
          onClick={() =>
            void run("sync", message.trim() ? { message: message.trim() } : undefined)
          }
        >
          <Zap size={15} />
          {busy === "sync" ? "Syncing…" : "Sync — commit · pull · push"}
        </button>
        <input
          placeholder="Commit message (blank = auto-generated)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="btn-row">
          <button
            className="btn"
            disabled={busy !== null || !message.trim() || status?.entries.length === 0}
            onClick={() => void run("commit", { message: message.trim() })}
          >
            {busy === "commit" ? "Committing…" : "Commit all"}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void run("push")}>
            {busy === "push" ? "Pushing…" : "Push"}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void run("pull")}>
            {busy === "pull" ? "Pulling…" : "Pull"}
          </button>
        </div>
      </div>

      {output && <pre className="git-output">{output}</pre>}

      {history.length > 0 && (
        <div className="timeline">
          <div className="eyebrow" style={{ paddingBottom: 6 }}>
            History
          </div>
          {history.map((entry, i) => (
            <button
              key={entry.sha}
              className="timeline-row"
              disabled={busy !== null || i === 0}
              onClick={() => revertTo(entry)}
              title={i === 0 ? "Current state" : "Reset workspace to this commit"}
            >
              <code className="timeline-sha">{entry.sha}</code>
              <span className="timeline-subject">{entry.subject}</span>
              {i === 0 && <span className="head-tag">HEAD</span>}
              <span className="timeline-when">{entry.when}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  async function setDiffFor(path: string | null) {
    try {
      const r = await api.gitDiff(sessionId, path ?? undefined);
      setDiff({ path, text: r.diff || "(no diff)" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
}
