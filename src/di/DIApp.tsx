import { useEffect, useState } from "react";
import "./tokens.css";
import "./di.css";
import { Frame } from "./Shell";
import { SessionScreen } from "./screens/Session";
import { ChangesScreen } from "./screens/Changes";
import { FilesScreen } from "./screens/Files";
import { PreviewScreen } from "./screens/Preview";
import { TasksScreen } from "./screens/Tasks";
import { seedState, type CavemanMode, type SessionState, type Theme, type Verdict, type View } from "./state";

const THEME_KEY = "di.theme";
const VIEW_KEY = "di.view";

export default function DIApp() {
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || "session");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "indigo");
  const [s, setS] = useState<SessionState>(seedState);

  // The rail colour is a per-user theme: drive [data-di-theme] on <html>.
  useEffect(() => {
    document.documentElement.setAttribute("data-di-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  const setCaveman = (mode: CavemanMode) =>
    setS((p) => ({ ...p, caveman: { ...p.caveman, mode } }));
  const unpin = (id: string) =>
    setS((p) => ({ ...p, pins: p.pins.filter((x) => x.id !== id) }));
  const setVerdict = (path: string, hunk: number, v: Verdict) =>
    setS((p) => ({
      ...p,
      changes: p.changes.map((c) =>
        c.path === path && c.hunks
          ? { ...c, hunks: c.hunks.map((h, i) => (i === hunk ? { ...h, verdict: h.verdict === v ? null : v } : h)) }
          : c,
      ),
    }));
  const setViewport = (vp: "phone" | "tablet" | "desktop") =>
    setS((p) => ({ ...p, preview: { ...p.preview, viewport: vp } }));
  const sendToAgent = () => setView("session");

  return (
    <div className="di-app">
      <Frame
        view={view} onView={setView}
        theme={theme} onTheme={setTheme}
        repoCount={s.repoCount}
        screen={
          <>
            {view === "session" && <SessionScreen s={s} onCaveman={setCaveman} onUnpin={unpin} />}
            {view === "changes" && <ChangesScreen s={s} onVerdict={setVerdict} />}
            {view === "files" && <FilesScreen />}
            {view === "preview" && <PreviewScreen s={s} onViewport={setViewport} onSendToAgent={sendToAgent} />}
            {view === "tasks" && <TasksScreen s={s} />}
          </>
        }
      />
    </div>
  );
}
