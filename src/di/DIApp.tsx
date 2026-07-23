import { useState } from "react";
import "./tokens.css";
import "./di.css";
import { getToken } from "../api";
import { Frame } from "./Shell";
import { Login } from "./Login";
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

export default function DIApp() {
  const [authed, setAuthed] = useState(() => !!getToken());
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Workbench onReauth={() => setAuthed(false)} />;
}

function Workbench({ onReauth }: { onReauth: () => void }) {
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || "changes");
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "indigo");
  const live = useControl();

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem(THEME_KEY, t); document.documentElement.setAttribute("data-di-theme", t); };
  const changeView = (v: View) => { setView(v); localStorage.setItem(VIEW_KEY, v); };
  // ensure the attribute is set on first paint
  document.documentElement.setAttribute("data-di-theme", theme);

  if (live.conn === "reauth") { onReauth(); return null; }

  const { state, chat, tree, activeDiff, cavemanSavings, sample, conn, error, actions } = live;

  return (
    <div className="di-app">
      <Frame
        view={view} onView={changeView}
        theme={theme} onTheme={setTheme}
        repoCount={state.repoCount}
        screen={
          <>
            {view === "session" && (
              <SessionScreen s={state} chat={chat} cavemanSavings={cavemanSavings} sample={sample}
                onCaveman={actions.setCaveman} onSend={actions.sendMessage}
                onApproval={actions.resolveApproval} onInterrupt={actions.interrupt} />
            )}
            {view === "changes" && (
              <ChangesScreen s={state} activeDiff={activeDiff} sample={sample}
                onSelect={actions.selectChange} onVerdict={actions.setVerdict}
                onReviewed={actions.markReviewed} onCommitSync={actions.commitSync} />
            )}
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

/** Non-blocking connection state — the app stays usable; the banner tells the
 *  truth about liveness (design invariant: every surface reads "still alive"). */
function ConnBanner({ conn, error, onRetry }: { conn: string; error: string | null; onRetry: () => void }) {
  if (conn === "live") return null;
  const msg: Record<string, { text: string; tone: string; icon: string }> = {
    loading: { text: "Connecting to the control plane…", tone: "var(--di-info)", icon: "loader" },
    connecting: { text: "Connecting…", tone: "var(--di-info)", icon: "loader" },
    offline: { text: "Reconnecting — session still alive", tone: "var(--di-warn)", icon: "refresh-cw" },
    nosession: { text: "No active session on the control plane yet", tone: "var(--di-ink-mute)", icon: "circle" },
    error: { text: error || "Control-plane error", tone: "var(--di-neg)", icon: "alert-triangle" },
  };
  const m = msg[conn] ?? msg.error;
  return (
    <button className="di-btn" onClick={onRetry} style={{ position: "fixed", bottom: 16, right: 16, zIndex: 40,
      display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 13px", borderRadius: 999,
      background: "var(--di-surface)", border: `1px solid ${m.tone}`, color: m.tone, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
      <Icon name={m.icon} size={13} />{m.text}
    </button>
  );
}
