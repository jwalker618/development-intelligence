import { useState } from "react";
import { getToken, setToken } from "./api";
import { ControlRoom } from "./components/ControlRoom";
import { Login } from "./components/Login";
import { SessionView } from "./components/SessionView";
import { SettingsScreen } from "./components/SettingsScreen";
import { useTheme } from "./ui";

export default function App() {
  const [cred, setCred] = useState(getToken());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { pref, setPref, theme, toggle } = useTheme();

  const logout = () => {
    setToken("");
    setCred("");
    setActiveId(null);
    setShowSettings(false);
  };

  if (!cred) {
    return (
      <Login
        onSave={(credential) => {
          setToken(credential);
          setCred(credential);
        }}
      />
    );
  }

  if (showSettings) {
    return (
      <SettingsScreen
        onBack={() => setShowSettings(false)}
        onLogout={logout}
        themePref={pref}
        setThemePref={setPref}
      />
    );
  }

  if (activeId) {
    return (
      <SessionView
        key={activeId}
        sessionId={activeId}
        onBack={() => setActiveId(null)}
        onSwitch={setActiveId}
        theme={theme}
        toggleTheme={toggle}
      />
    );
  }

  return (
    <ControlRoom
      onOpen={(id) => setActiveId(id)}
      onSettings={() => setShowSettings(true)}
      onLogout={logout}
    />
  );
}
