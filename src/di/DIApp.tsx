import { useEffect, useState } from "react";
import "./tokens.css";
import "./di.css";
import { api, getToken } from "../api";
import { Frame } from "./Shell";
import { Login } from "./frontdoor/Login";
import { ConnectClaude } from "./frontdoor/ConnectClaude";
import { SessionsHome } from "./frontdoor/SessionsHome";
import { Settings } from "./frontdoor/Settings";
import { CloseSession } from "./frontdoor/CloseSession";
import { useControl } from "./useControl";
import { SessionScreen } from "./screens/Session";
import { ChangesScreen } from "./screens/Changes";
import { FilesScreen } from "./screens/Files";
import { PreviewScreen } from "./screens/Preview";
import { TasksScreen } from "./screens/Tasks";
import { Icon } from "./primitives";
import { type Theme, type View } from "./state";

const THEME_KEY = "di.theme";
const VIEW_KEY = "di.view";

type Route = "home" | "connect" | "settings" | "workbench";

export default function DIApp() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [reauth, setReauth] = useState(false);
  if (!authed || reauth) return <Login reauth={reauth} onDone={() => { setAuthed(true); setReauth(false); }} />;
  return <Root onReauth={() => setReauth(true)} />;
}

const SESSION_KEY = "di.session";

function Root({ onReauth }: { onReauth: () => void }) {
  const stored = localStorage.getItem(SESSION_KEY);
  const [route, setRoute] = useState<Route>(stored ? "workbench" : "home");
  const [sessionId, setSessionIdState] = useState<string | null>(stored);
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "indigo");

  const setTheme = (t: Theme) => { setThemeState(t); document.documentElement.setAttribute("data-di-theme", t); localStorage.setItem(THEME_KEY, t); };
  useEffect(() => { document.documentElement.setAttribute("data-di-theme", theme); localStorage.setItem(THEME_KEY, theme); }, [theme]);

  // Persist the chosen session so a refresh returns to the workbench, not home.
  const setSessionId = (id: string | null) => { setSessionIdState(id); if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); };

  useEffect(() => {
    // Only gate on Connect Claude for a fresh landing (no session yet).
    if (stored) return;
    void api.claudeToken().then((r) => { if (!r.source) setRoute("connect"); }).catch(() => undefined);
  }, [stored]);

  const openSession = (id: string) => { setSessionId(id); setRoute("workbench"); };
  const backToWork = () => setRoute(sessionId ? "workbench" : "home");

  if (route === "connect") return <ConnectClaude onDone={backToWork} onSkip={backToWork} />;
  if (route === "settings") return (
    <Settings theme={theme} onTheme={setTheme} onClose={backToWork}
      sessionId={sessionId}
      onReconnect={() => setRoute("connect")}
      onSignOut={onReauth} />
  );
  if (route === "home" || !sessionId) return <SessionsHome onOpen={openSession} onSettings={() => setRoute("settings")} />;

  return (
    <Workbench
      sessionId={sessionId} theme={theme} onTheme={setTheme}
      onSwitchSession={setSessionId}
      onNewSession={() => setRoute("home")}
      onAllSessions={() => setRoute("home")}
      onSettings={() => setRoute("settings")}
      onConnect={() => setRoute("connect")}
      onClosed={() => { setSessionId(null); setRoute("home"); }}
      onReauth={onReauth}
    />
  );
}

function Workbench({
  sessionId, theme, onTheme, onSwitchSession, onNewSession, onAllSessions, onSettings, onConnect, onClosed, onReauth,
}: {
  sessionId: string; theme: Theme; onTheme: (t: Theme) => void;
  onSwitchSession: (id: string) => void; onNewSession: () => void; onAllSessions: () => void; onSettings: () => void;
  onConnect: () => void; onClosed: () => void; onReauth: () => void;
}) {
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || "changes");
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const [claudeConnected, setClaudeConnected] = useState<boolean | null>(null);
  const live = useControl(sessionId);
  const changeView = (v: View) => { setView(v); localStorage.setItem(VIEW_KEY, v); };

  useEffect(() => { if (live.conn === "reauth") onReauth(); }, [live.conn, onReauth]);
  useEffect(() => { void api.claudeToken().then((r) => setClaudeConnected(!!r.source)).catch(() => setClaudeConnected(true)); }, []);
  // A stored token is only a PROXY for "Claude is connected" — a credential
  // injected as an env var or file descriptor leaves no token on the volume, so
  // a perfectly working session was being told to go and connect Claude. The
  // CLI reporting an account is the fact; trust it over the proxy.
  const connected = claudeConnected || live.status?.authenticated === true;

  const { state, sessions, chat, models, usage, trees, repos, syncing, activeDiff, cavemanSavings, status, statusAt, offline, sample, conn, error, actions } = live;
  const target = sessions.find((s) => s.id === closeTarget);

  return (
    <div className="di-app">
      <Frame
        view={view} onView={changeView} theme={theme} onTheme={onTheme}
        repoCount={state.repoCount}
        sessions={sessions} currentSessionId={sessionId}
        repos={repos} onAddRepo={actions.addRepo} onRemoveRepo={actions.removeRepo}
        onSwitchSession={onSwitchSession} onNewSession={onNewSession} onAllSessions={onAllSessions} onSettings={onSettings}
        onCloseSession={setCloseTarget}
        screen={
          <>
            {view === "session" && <SessionScreen s={state} chat={chat} cavemanSavings={cavemanSavings} sample={sample} claudeConnected={connected} onConnect={onConnect} onCaveman={actions.setCaveman} onSend={actions.sendMessage} onApproval={actions.resolveApproval} onInterrupt={actions.interrupt} models={models} usage={usage} status={status} statusAt={statusAt} offline={offline} onModel={actions.setModel} onEffort={actions.setEffort} onRefreshModels={actions.refreshModels} onPermissionMode={actions.setPermissionMode} onReadOnly={actions.setReadOnly} onBudget={actions.setBudget} onMaxTurns={actions.setMaxTurns} onOpenDiagnostics={onSettings} onPreviewRewind={actions.previewRewind} onRewind={actions.rewind} onAddPin={actions.addPin} onRemovePin={actions.removePin} onSearch={actions.search} />}
            {view === "changes" && <ChangesScreen s={state} repos={repos} syncing={syncing} activeDiff={activeDiff} sample={sample} loading={conn === "loading"} onSelect={actions.selectChange} onVerdict={actions.setVerdict} onReviewed={actions.markReviewed} onCommitSync={actions.commitSync} />}
            {view === "files" && <FilesScreen trees={trees} repos={repos} sessionId={sessionId} />}
            {view === "preview" && <PreviewScreen s={state} sample={sample} onViewport={() => undefined} onSendToAgent={() => changeView("session")} />}
            {view === "tasks" && <TasksScreen s={state} sample={sample} live={chat.tasks} />}
          </>
        }
      />
      <ConnBanner conn={conn} error={error} onRetry={actions.refresh} />
      {target && <CloseSession id={target.id} repo={target.repo} branch={target.branch} onCancel={() => setCloseTarget(null)} onClosed={() => { setCloseTarget(null); onClosed(); }} />}
    </div>
  );
}

function ConnBanner({ conn, error, onRetry }: { conn: string; error: string | null; onRetry: () => void }) {
  if (conn === "live") return null;
  const msg: Record<string, { text: string; tone: string; icon: string }> = {
    loading: { text: "Loading session…", tone: "var(--di-info)", icon: "loader" },
    connecting: { text: "Connecting…", tone: "var(--di-info)", icon: "loader" },
    offline: { text: "Reconnecting — session still alive", tone: "var(--di-warn)", icon: "refresh-cw" },
    error: { text: error || "Control-plane error", tone: "var(--di-neg)", icon: "alert-triangle" },
  };
  const m = msg[conn] ?? msg.error;
  return (
    <button className="di-btn" onClick={onRetry} style={{ position: "fixed", bottom: 16, right: 16, zIndex: 40, display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 13px", borderRadius: 999, background: "var(--di-surface)", border: `1px solid ${m.tone}`, color: m.tone, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
      <Icon name={m.icon} size={13} />{m.text}
    </button>
  );
}
