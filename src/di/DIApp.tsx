import { useEffect, useState } from "react";
import "./tokens.css";
import "./di.css";
import { api, getToken } from "../api";
import { Frame } from "./Shell";
import { Login } from "./frontdoor/Login";
import { ConnectClaude } from "./frontdoor/ConnectClaude";
import { SessionsHome } from "./frontdoor/SessionsHome";
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

type Route = "home" | "connect" | "workbench";

export default function DIApp() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [reauth, setReauth] = useState(false);
  if (!authed || reauth) return <Login reauth={reauth} onDone={() => { setAuthed(true); setReauth(false); }} />;
  return <Root onReauth={() => setReauth(true)} />;
}

function Root({ onReauth }: { onReauth: () => void }) {
  const [route, setRoute] = useState<Route>("home");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "indigo");

  useEffect(() => { document.documentElement.setAttribute("data-di-theme", theme); localStorage.setItem(THEME_KEY, theme); }, [theme]);

  // After login, land on Connect Claude if it isn't connected yet — nothing
  // the agent does works without it. Skippable → Sessions Home.
  useEffect(() => {
    void api.claudeToken().then((r) => { if (!r.source) setRoute("connect"); }).catch(() => undefined);
  }, []);

  const openSession = (id: string) => { setSessionId(id); setRoute("workbench"); };

  if (route === "connect") return <ConnectClaude onDone={() => setRoute("home")} onSkip={() => setRoute("home")} />;
  if (route === "home" || !sessionId) return <SessionsHome onOpen={openSession} onSettings={() => setRoute("connect")} />;

  return (
    <Workbench
      sessionId={sessionId} theme={theme} onTheme={setThemeState}
      onSwitchSession={setSessionId}
      onNewSession={() => setRoute("home")}
      onAllSessions={() => setRoute("home")}
      onSettings={() => setRoute("connect")}
      onReauth={onReauth}
    />
  );
}

function Workbench({
  sessionId, theme, onTheme, onSwitchSession, onNewSession, onAllSessions, onSettings, onReauth,
}: {
  sessionId: string; theme: Theme; onTheme: (t: Theme) => void;
  onSwitchSession: (id: string) => void; onNewSession: () => void; onAllSessions: () => void; onSettings: () => void; onReauth: () => void;
}) {
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || "changes");
  const live = useControl(sessionId);
  const changeView = (v: View) => { setView(v); localStorage.setItem(VIEW_KEY, v); };

  useEffect(() => { if (live.conn === "reauth") onReauth(); }, [live.conn, onReauth]);

  const { state, sessions, chat, tree, activeDiff, cavemanSavings, sample, conn, error, actions } = live;

  return (
    <div className="di-app">
      <Frame
        view={view} onView={changeView} theme={theme} onTheme={onTheme}
        repoCount={state.repoCount}
        sessions={sessions} currentSessionId={sessionId}
        onSwitchSession={onSwitchSession} onNewSession={onNewSession} onAllSessions={onAllSessions} onSettings={onSettings}
        screen={
          <>
            {view === "session" && <SessionScreen s={state} chat={chat} cavemanSavings={cavemanSavings} sample={sample} onCaveman={actions.setCaveman} onSend={actions.sendMessage} onApproval={actions.resolveApproval} onInterrupt={actions.interrupt} />}
            {view === "changes" && <ChangesScreen s={state} activeDiff={activeDiff} sample={sample} onSelect={actions.selectChange} onVerdict={actions.setVerdict} onReviewed={actions.markReviewed} onCommitSync={actions.commitSync} />}
            {view === "files" && <FilesScreen tree={tree} onOpen={() => undefined} />}
            {view === "preview" && <PreviewScreen s={state} sample={sample} onViewport={() => undefined} onSendToAgent={() => changeView("session")} />}
            {view === "tasks" && <TasksScreen s={state} sample={sample} />}
          </>
        }
      />
      <ConnBanner conn={conn} error={error} onRetry={actions.refresh} />
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
