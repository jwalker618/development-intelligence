import {
  AlertTriangle,
  Check,
  ChevronRight,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type SessionInfo } from "../api";
import { bucketOf, CaveMark, Sheet, sortSessions, useSessions } from "../ui";

interface Props {
  onOpen: (id: string) => void;
  onSettings: () => void;
  onLogout: () => void;
}

/**
 * Sessions control room (design 4a): triage every concurrent agent in <5s.
 * Ranked needs-you → setup → running → idle; New session lives in a FAB.
 */
export function ControlRoom({ onOpen, onSettings, onLogout }: Props) {
  const { sessions, refresh, error } = useSessions(5000);
  const [showNew, setShowNew] = useState(false);
  const [confirmKill, setConfirmKill] = useState<SessionInfo | null>(null);

  const sorted = useMemo(() => sortSessions(sessions), [sessions]);
  const needs = sorted.filter((s) => bucketOf(s) === "needs");
  const running = sorted.filter((s) => bucketOf(s) === "running" || bucketOf(s) === "setup");
  const idle = sorted.filter((s) => bucketOf(s) === "idle");

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">
          <CaveMark size={24} /> Development Intelligence
        </span>
        <button className="icon-btn" onClick={onSettings} title="Settings">
          <Settings size={18} />
        </button>
      </header>

      <main className="scroll" style={{ paddingBottom: 90 }}>
        {error && (
          <div className="error">
            {error}
            {error === "unauthorized" && (
              <button className="btn ghost" onClick={onLogout}>
                Re-enter token
              </button>
            )}
          </div>
        )}

        {needs.length > 0 && (
          <button
            className="triage-card pillup"
            onClick={() => onOpen(needs[0].id)}
          >
            <span className="hero-num">{needs.length}</span>
            <span className="stack">
              <strong>{needs.length === 1 ? "agent needs you" : "agents need you"}</strong>
              <span className="muted">
                {running.length} running · {idle.length} idle · {sessions.length} total
              </span>
            </span>
            <ChevronRight size={18} />
          </button>
        )}

        {needs.length > 0 && <div className="eyebrow accent">Needs you</div>}
        {needs.map((s) => (
          <div key={s.id} className="session-card needs" onClick={() => onOpen(s.id)}>
            <div className="top">
              <span className="repo">{shortRepo(s.repo)}</span>
              <span className="sub">{s.branch ?? ""}</span>
              <span className="meta-right">
                <span className="dot needs" style={{ display: "inline-block", marginRight: 6 }} />
                NEEDS YOU
              </span>
            </div>
            <div className="row" style={{ fontSize: 13 }}>
              <AlertTriangle size={13} style={{ color: "var(--accent-ink)" }} />
              <span>approve {s.approval ? <code>{s.approval}</code> : "the agent's request"}</span>
            </div>
            <button
              className="btn primary wide"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(s.id);
              }}
            >
              Review <ChevronRight size={15} />
            </button>
          </div>
        ))}

        {running.length > 0 && <div className="eyebrow">Running · {running.length}</div>}
        {running.map((s) => (
          <SessionCard key={s.id} s={s} onOpen={onOpen} onKill={setConfirmKill} />
        ))}

        {idle.length > 0 && <div className="eyebrow">Idle · {idle.length}</div>}
        {idle.map((s) => (
          <SessionCard key={s.id} s={s} onOpen={onOpen} onKill={setConfirmKill} />
        ))}

        {sessions.length === 0 && !error && (
          <div className="card" style={{ alignItems: "center", padding: 28 }}>
            <p className="muted">No sessions — start one.</p>
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setShowNew(true)}>
        <Plus size={17} /> New session
      </button>

      {showNew && (
        <NewSessionSheet
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            onOpen(id);
          }}
        />
      )}
      {confirmKill && (
        <Sheet onClose={() => setConfirmKill(null)}>
          <div className="sheet-head">
            <h2>Destroy this session?</h2>
          </div>
          <p className="muted">
            {confirmKill.repo}
            {confirmKill.branch ? ` · ${confirmKill.branch}` : ""} — the workspace and any
            uncommitted work in it are deleted. This cannot be undone.
          </p>
          <div className="btn-row">
            <button
              className="btn danger"
              onClick={async () => {
                await api.deleteSession(confirmKill.id).catch(() => undefined);
                setConfirmKill(null);
                void refresh();
              }}
            >
              Destroy workspace
            </button>
            <button className="btn" onClick={() => setConfirmKill(null)}>
              Keep it
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function shortRepo(repo: string): string {
  return repo.split("/")[1] ?? repo;
}

function SessionCard({
  s,
  onOpen,
  onKill,
}: {
  s: SessionInfo;
  onOpen: (id: string) => void;
  onKill: (s: SessionInfo) => void;
}) {
  const bucket = bucketOf(s);
  const idle = bucket === "idle";
  return (
    <div
      className={`session-card${idle ? " idle" : ""}`}
      onClick={() => onOpen(s.id)}
    >
      <div className="top">
        {bucket === "setup" ? (
          <span className="dot setup" />
        ) : idle ? (
          s.lastLine ? (
            <span className="dot idle" />
          ) : (
            <Check size={12} style={{ color: "var(--ok-check)" }} />
          )
        ) : (
          <span className="dot live" />
        )}
        <span className="repo">{shortRepo(s.repo)}</span>
        <button
          className="icon-btn"
          style={{ marginLeft: "auto", minHeight: 28, minWidth: 28 }}
          onClick={(e) => {
            e.stopPropagation();
            onKill(s);
          }}
          title="Destroy session"
        >
          <X size={14} />
        </button>
      </div>
      <div className="sub">
        {s.branch ?? "default branch"}
        {s.model && ` · ${s.model}`}
        {s.setup === "running" && " · setup running"}
        {s.setup === "failed" && " · setup failed"}
        {s.lastLine ? <> · {renderLastLine(s.lastLine)}</> : idle ? " · clean" : null}
      </div>
    </div>
  );
}

/** Colour +N additions green in last-line snippets, per the design. */
function renderLastLine(line: string) {
  const parts = line.split(/(\+\d+)/g);
  return parts.map((p, i) =>
    /^\+\d+$/.test(p) ? (
      <span key={i} className="add">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function NewSessionSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [repos, setRepos] = useState<string[]>([]);
  const [source, setSource] = useState<"github" | "config">("config");
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const [newName, setNewName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState<"clone" | "repo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .repos()
      .then((r) => {
        setRepos(r.repos);
        setSource(r.source);
      })
      .catch(() => undefined);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (q ? repos.filter((r) => r.toLowerCase().includes(q)) : repos).slice(0, 8);
  // Free-typed owner/repo not in the list still works — sessions clone anything
  // the PAT can reach.
  const freeform =
    /^[\w.-]+\/[\w.-]+$/.test(query.trim()) && !repos.includes(query.trim())
      ? query.trim()
      : null;

  const start = async (target: string) => {
    setBusy("clone");
    setError(null);
    setRepo(target);
    try {
      const s = await api.createSession([{ repo: target, branch: branch.trim() || null }]);
      onCreated(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const createRepoAndStart = async () => {
    if (!newName.trim()) return;
    setBusy("repo");
    setError(null);
    try {
      const r = await api.createRepo(newName.trim(), isPrivate);
      // GitHub occasionally needs a beat after auto_init before the first clone.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await start(r.repo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  if (busy) {
    return (
      <Sheet onClose={() => undefined}>
        <div className="sheet-head">
          <h2>New session</h2>
        </div>
        <p className="muted">
          {busy === "repo" ? `Creating ${newName.trim()} on GitHub…` : `Cloning ${repo}…`}
        </p>
        <div className="clone-shimmer" />
        <p className="muted faint">
          Fresh checkouts take up to a minute. The session opens when it's ready.
        </p>
        {error && <div className="error">{error}</div>}
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>{mode === "pick" ? "New session" : "New repo"}</h2>
        <button className="icon-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {mode === "pick" ? (
        <>
          <input
            className="mono"
            placeholder="Search your repos…"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setRepo(null);
            }}
          />
          {source === "config" && (
            <p className="muted faint">
              Showing configured repos — set GROTTO_GIT_TOKEN to search your full
              GitHub list.
            </p>
          )}
          <div className="repo-list">
            {filtered.map((r) => (
              <button
                key={r}
                className={repo === r ? "switch-row current" : "switch-row"}
                onClick={() => setRepo(r)}
              >
                <span className="repo">{r}</span>
              </button>
            ))}
            {freeform && (
              <button
                className={repo === freeform ? "switch-row current" : "switch-row"}
                onClick={() => setRepo(freeform)}
              >
                <span className="repo">{freeform}</span>
                <span className="tag">USE TYPED</span>
              </button>
            )}
            {filtered.length === 0 && !freeform && (
              <p className="muted">No matches — type a full owner/repo to use it anyway.</p>
            )}
          </div>
          <label className="field">
            <span>Branch (optional — created if missing)</span>
            <input
              className="mono"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </label>
          <button
            className="btn primary wide"
            disabled={!repo}
            onClick={() => repo && void start(repo)}
          >
            Start session{repo ? ` — ${repo.split("/")[1]}` : ""}
          </button>
          <button className="btn ghost" onClick={() => setMode("create")}>
            <Plus size={14} /> Create a new repo instead
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Repo name (created in your GitHub account)</span>
            <input
              className="mono"
              autoFocus
              placeholder="my-new-idea"
              value={newName}
              onChange={(e) => setNewName(e.target.value.replace(/[^\w.-]/g, "-"))}
            />
          </label>
          <label className="row" style={{ fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Private repo
          </label>
          <label className="field">
            <span>Branch (optional)</span>
            <input
              className="mono"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </label>
          <button
            className="btn primary wide"
            disabled={!newName.trim()}
            onClick={() => void createRepoAndStart()}
          >
            Create repo & start session
          </button>
          <button className="btn ghost" onClick={() => setMode("pick")}>
            ‹ Back to your repos
          </button>
        </>
      )}
    </Sheet>
  );
}
