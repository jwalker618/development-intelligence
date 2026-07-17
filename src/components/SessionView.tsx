import {
  ChevronDown,
  ChevronLeft,
  Cpu,
  Eye,
  Folder,
  GitBranch,
  KeyRound,
  MessageSquare,
  Moon,
  Plus,
  Sun,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type SessionInfo } from "../api";
import {
  bucketOf,
  CaveMark,
  looksLikeShellPrompt,
  Pickaxe,
  Sheet,
  sortSessions,
  splitPin,
  type Theme,
  useCaveman,
  useMediaQuery,
  useSessions,
} from "../ui";
import { Chat } from "./Chat";
import { ClaudeConnect } from "./ClaudeConnect";
import { Files } from "./Files";
import { Git } from "./Git";
import { KeyBar } from "./KeyBar";
import { LinksSheet } from "./LinksSheet";
import { Preview } from "./Preview";
import { TerminalPane } from "./Terminal";

type Tab = "chat" | "agent" | "files" | "git" | "preview";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "chat", label: "Agent", icon: <MessageSquare size={14} /> },
  { id: "agent", label: "Term", icon: <TerminalIcon size={14} /> },
  { id: "files", label: "Files", icon: <Folder size={14} /> },
  { id: "git", label: "Git", icon: <GitBranch size={14} /> },
  { id: "preview", label: "Preview", icon: <Eye size={14} /> },
];

interface Props {
  sessionId: string;
  onBack: () => void;
  onSwitch: (id: string) => void;
  theme: Theme;
  toggleTheme: () => void;
}

/**
 * Terminal-only agent screen (field ruling): the terminal is the sole input —
 * no composer, no approval overlay. Quick commands live in the chips strip,
 * approvals are answered with the ✓1/✓✓2/✗3 keys or by typing, and file
 * references from the Files tab type @mentions straight into the terminal.
 */
export function SessionView({ sessionId, onBack, onSwitch, theme, toggleTheme }: Props) {
  const [tab, setTab] = useState<Tab>("chat");
  const { sessions } = useSessions(5000);
  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const caveman = useCaveman();
  const isDesktop = useMediaQuery("(min-width: 1100px)");

  // PTY bridge: the terminal registers its sender and focus fn.
  const sendRef = useRef<(d: string) => void>(() => {});
  const registerSend = useCallback((send: (d: string) => void) => {
    sendRef.current = send;
  }, []);
  const send = useCallback((d: string) => sendRef.current(d), []);
  const focusRef = useRef<() => void>(() => {});
  const registerFocus = useCallback((focus: () => void) => {
    focusRef.current = focus;
  }, []);
  const focusTerminal = useCallback(() => focusRef.current(), []);

  // Guided Claude connect: when no subscription token is stored, the chips
  // strip leads with a Connect chip that opens the procedural modal — the
  // terminal never handles the OAuth dance.
  const [claudeSource, setClaudeSource] = useState<"grotto" | "env" | null | undefined>(undefined);
  const [connectOpen, setConnectOpen] = useState(false);
  useEffect(() => {
    void api.claudeToken().then((r) => setClaudeSource(r.source)).catch(() => undefined);
  }, []);

  // Link collection (Links sheet) — registered by the terminal.
  const scanRef = useRef<() => string[]>(() => []);
  const registerLinkScan = useCallback((scan: () => string[]) => {
    scanRef.current = scan;
  }, []);
  const [linksOpen, setLinksOpen] = useState(false);

  // Paste into the terminal: iOS never shows a paste menu over a canvas
  // terminal. Try the async clipboard, but race it against a timeout — an
  // unanswered permission prompt leaves readText() PENDING FOREVER, not
  // rejected. Fall back to a sheet with a native textarea, where paste
  // always works; if the permission grant arrives late, insert and close.
  const [pasteSheetOpen, setPasteSheetOpen] = useState(false);
  const pasteToTerminal = useCallback(async () => {
    const read: Promise<string> | null = (() => {
      try {
        return navigator.clipboard?.readText() ?? null;
      } catch {
        return null;
      }
    })();
    if (read) {
      const text = await Promise.race([
        read.catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (text) {
        send(text);
        setTimeout(() => focusRef.current(), 50);
        return;
      }
      // Late grant (e.g. iOS paste bubble tapped after our timeout).
      void read
        .then((late) => {
          if (late) {
            send(late);
            setPasteSheetOpen(false);
            setTimeout(() => focusRef.current(), 50);
          }
        })
        .catch(() => undefined);
    }
    setPasteSheetOpen(true);
  }, [send]);

  // Shell-vs-agent detection drives the model sheet's start-or-switch choice.
  const [atShell, setAtShell] = useState(true);
  const onTail = useCallback((tail: string) => {
    setAtShell(looksLikeShellPrompt(tail));
  }, []);

  // Session switcher + cross-session "needs you" banner.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);
  const otherNeeds = sessions.find((s) => s.needsYou && s.id !== sessionId);
  const showBanner = otherNeeds && dismissedBanner !== otherNeeds.id;

  // Chat draft insertion (Files tab @mentions target the chat, the primary
  // agent surface).
  const chatInsertRef = useRef<(text: string) => void>(() => {});
  const registerChatInsert = useCallback((insert: (text: string) => void) => {
    chatInsertRef.current = insert;
  }, []);

  /** Reference a file in the chat draft (no submit — keep typing). */
  const askAbout = useCallback((pin: string) => {
    const { path, range } = splitPin(pin);
    chatInsertRef.current(`@${path}${range ? ` lines ${range}` : ""} `);
    setTab("chat");
  }, []);

  const savings = caveman?.savings?.replace(/^⛏\s*/, "") ?? null;
  const mode = caveman?.mode ?? null;

  const chatPane = (
    <Chat
      sessionId={sessionId}
      visible={isDesktop ? tab !== "agent" : tab === "chat"}
      needsConnect={claudeSource === null}
      onConnect={() => setConnectOpen(true)}
      registerInsert={registerChatInsert}
    />
  );

  const agentPane = (
    <div className={tab === "agent" ? "agent-pane" : "agent-pane hidden"}>
      {mode && (
        <div className="savings-hero">
          <Pickaxe size={16} />
          <span className="value">{savings ?? "—"}</span>
          <span className="label">saved · caveman {mode}</span>
          <Sparkline />
        </div>
      )}
      <div className="workbench-rule">
        <span className="eyebrow">Agent workbench · live</span>
      </div>
      <TerminalPane
        sessionId={sessionId}
        registerSend={registerSend}
        registerFocus={registerFocus}
        registerLinkScan={registerLinkScan}
        onTail={onTail}
        visible={tab === "agent"}
      />
      <div className="chips chips-strip">
        {claudeSource === null && (
          <button className="chip filled" onClick={() => setConnectOpen(true)}>
            <KeyRound size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Connect Claude
          </button>
        )}
        {[
          { label: "claude", command: "claude", filled: true },
          { label: "gemini", command: "gemini" },
          { label: "/caveman", command: "/caveman" },
          { label: "/caveman ultra", command: "/caveman ultra" },
          { label: "/caveman-stats", command: "/caveman-stats" },
          { label: "/caveman-prune", command: "/caveman-prune" },
          { label: "git status", command: "git status" },
        ].map((c) => (
          <button
            key={c.label}
            className={c.filled ? "chip filled" : "chip"}
            onClick={() => send(c.command + "\r")}
          >
            {c.label}
          </button>
        ))}
      </div>
      <KeyBar
        send={send}
        focusTerminal={focusTerminal}
        onShowLinks={() => setLinksOpen(true)}
        onPaste={() => void pasteToTerminal()}
      />
    </div>
  );

  const sidePanes = (
    <>
      {tab === "files" && <Files sessionId={sessionId} onAsk={askAbout} />}
      {tab === "git" && <Git sessionId={sessionId} />}
      {tab === "preview" && <Preview sessionId={sessionId} />}
    </>
  );

  const topbar = (
    <header className="topbar">
      <button className="icon-btn" onClick={onBack} title="Control room">
        <ChevronLeft size={19} />
      </button>
      <button className="brand-center" onClick={() => setSwitcherOpen(true)}>
        <span>{session ? session.repo.split("/")[1] ?? session.repo : "…"}</span>
        {session?.branch && <span className="branch">· {session.branch}</span>}
        <ChevronDown size={13} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
      </button>
      {isDesktop && (
        <nav className="seg">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button
        className={session?.model ? "caveman-pill model-pill" : "caveman-pill off model-pill"}
        onClick={() => setModelSheetOpen(true)}
        title="Model — tap to switch"
      >
        <Cpu size={11} />
        {session?.model ?? "model ?"}
      </button>
      <span className={mode ? "caveman-pill" : "caveman-pill off"}>
        {mode ? (mode === "full" ? "CAVEMAN" : mode.toUpperCase()) : "caveman off"}
      </span>
    </header>
  );

  const banner = showBanner && otherNeeds && (
    <div className="xbanner">
      <span className="dot needs" />
      <span>
        <strong>{otherNeeds.repo.split("/")[1] ?? otherNeeds.repo}</strong> needs you
        {otherNeeds.approval ? ` — ${otherNeeds.approval}` : ""}
      </span>
      <button className="btn outline go" onClick={() => onSwitch(otherNeeds.id)}>
        Go
      </button>
      <button className="icon-btn" onClick={() => setDismissedBanner(otherNeeds.id)}>
        <X size={14} />
      </button>
    </div>
  );

  const modelSheet = modelSheetOpen && (
    <ModelSheet
      current={session?.model ?? null}
      chatMode={tab !== "agent"}
      atShell={atShell}
      onClose={() => setModelSheetOpen(false)}
      onPick={(alias) => {
        if (tab === "agent") {
          // At a bash prompt, /model is not a command — start claude with the
          // model instead. Inside the claude REPL, /model switches live.
          send(atShell ? `claude --model ${alias}\r` : `/model ${alias}\r`);
        } else {
          void api
            .chatModel(sessionId, alias === "default" ? null : alias)
            .catch(() => undefined);
        }
        setModelSheetOpen(false);
      }}
    />
  );

  const linksSheet = linksOpen && (
    <LinksSheet scan={() => scanRef.current()} onClose={() => setLinksOpen(false)} />
  );

  const connectSheet = connectOpen && (
    <ClaudeConnect
      onClose={() => setConnectOpen(false)}
      onDone={() =>
        void api.claudeToken().then((r) => setClaudeSource(r.source)).catch(() => undefined)
      }
    />
  );

  const pasteSheet = pasteSheetOpen && (
    <PasteSheet
      onClose={() => setPasteSheetOpen(false)}
      onInsert={(text, withEnter) => {
        send(withEnter ? text + "\r" : text);
        setPasteSheetOpen(false);
        setTimeout(() => focusRef.current(), 50);
      }}
    />
  );

  const switcher = switcherOpen && (
    <SwitcherSheet
      sessions={sessions}
      currentId={sessionId}
      onClose={() => setSwitcherOpen(false)}
      onPick={(id) => {
        setSwitcherOpen(false);
        if (id !== sessionId) onSwitch(id);
      }}
      onNew={() => {
        setSwitcherOpen(false);
        onBack();
      }}
    />
  );

  if (isDesktop) {
    return (
      <div className="desktop-shell" style={{ position: "relative" }}>
        {banner}
        <SessionsRail sessions={sessions} currentId={sessionId} onPick={onSwitch} onBack={onBack} />
        <div className="workbench">
          {topbar}
          {tab === "agent" || tab === "chat" ? (
            <>
              {chatPane}
              {agentPane}
            </>
          ) : (
            <div className="two-pane">
              {chatPane}
              {agentPane}
              <div className="side-pane">{sidePanes}</div>
            </div>
          )}
        </div>
        {switcher}
        {modelSheet}
        {linksSheet}
        {pasteSheet}
        {connectSheet}
      </div>
    );
  }

  return (
    <div className="page" style={{ position: "relative" }}>
      {banner}
      {topbar}
      {chatPane}
      {agentPane}
      {tab !== "agent" && tab !== "chat" && <main className="scroll">{sidePanes}</main>}
      <nav className="tabdock">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      {switcher}
      {modelSheet}
      {linksSheet}
      {pasteSheet}
      {connectSheet}
    </div>
  );
}

/** Fallback paste path: a native textarea, where iOS paste always works. */
function PasteSheet({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (text: string, withEnter: boolean) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>Paste into terminal</h2>
      </div>
      <p className="muted">
        Long-press and paste here (e.g. the authentication code), then insert it into
        the terminal.
      </p>
      <textarea
        className="mono"
        rows={3}
        autoFocus
        placeholder="paste here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="btn-row">
        <button
          className="btn primary"
          style={{ flex: 1 }}
          disabled={!text}
          onClick={() => onInsert(text, true)}
        >
          Insert + Enter
        </button>
        <button className="btn" disabled={!text} onClick={() => onInsert(text, false)}>
          Insert
        </button>
      </div>
    </Sheet>
  );
}

/** Decorative six-bar savings sparkline (dim → bright accent). */
function Sparkline() {
  const bars = [7, 10, 8, 13, 16, 20];
  return (
    <span className="spark" aria-hidden>
      {bars.map((h, i) => (
        <i key={i} className={i >= 4 ? "hi" : ""} style={{ height: h }} />
      ))}
    </span>
  );
}

const MODELS: Array<{ alias: string; label: string; hint: string }> = [
  { alias: "sonnet", label: "Sonnet", hint: "fast, everyday coding" },
  { alias: "opus", label: "Opus", hint: "deepest reasoning, slower + pricier" },
  { alias: "haiku", label: "Haiku", hint: "cheapest, quick chores" },
  { alias: "default", label: "Default", hint: "your account's configured default" },
];

function ModelSheet({
  current,
  chatMode,
  atShell,
  onClose,
  onPick,
}: {
  current: string | null;
  chatMode: boolean;
  atShell: boolean;
  onClose: () => void;
  onPick: (alias: string) => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>Model{current ? ` · ${current}` : ""}</h2>
      </div>
      <p className="muted">
        {chatMode
          ? "Applies to the agent chat — takes effect from the next message."
          : atShell
            ? "claude isn't running — picking a model starts it with that model."
            : "Sends /model to the running claude session; the pill updates in a few seconds."}
      </p>
      {MODELS.map((m) => (
        <button key={m.alias} className="switch-row" onClick={() => onPick(m.alias)}>
          <Cpu size={14} style={{ color: "var(--accent-ink)" }} />
          <span style={{ minWidth: 0 }}>
            <div className="repo">{m.label}</div>
            <div className="sub">{m.hint}</div>
          </span>
        </button>
      ))}
      <div className="composer-row">
        <input
          className="mono"
          placeholder="custom model id or alias"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) onPick(custom.trim());
          }}
        />
        <button
          className="btn outline"
          disabled={!custom.trim()}
          onClick={() => onPick(custom.trim())}
        >
          Switch
        </button>
      </div>
    </Sheet>
  );
}

function statusOf(s: SessionInfo): string {
  const bucket = bucketOf(s);
  if (bucket === "needs") return s.approval ?? "waiting on approval";
  if (bucket === "setup") return s.setup === "failed" ? "setup failed" : "setup running";
  if (bucket === "running") return s.lastLine ?? "shell live";
  return s.lastLine ? "idle" : "clean";
}

function SwitcherSheet({
  sessions,
  currentId,
  onClose,
  onPick,
  onNew,
}: {
  sessions: SessionInfo[];
  currentId: string;
  onClose: () => void;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const sorted = useMemo(() => {
    const rest = sortSessions(sessions.filter((s) => s.id !== currentId));
    const current = sessions.find((s) => s.id === currentId);
    const needs = rest.filter((s) => bucketOf(s) === "needs");
    const others = rest.filter((s) => bucketOf(s) !== "needs");
    return { needs, current, others };
  }, [sessions, currentId]);

  const row = (s: SessionInfo, cls: string, tag: string | null) => (
    <button key={s.id} className={`switch-row ${cls}`} onClick={() => onPick(s.id)}>
      <span
        className={`dot ${
          bucketOf(s) === "needs"
            ? "needs"
            : bucketOf(s) === "running"
              ? "live"
              : bucketOf(s) === "setup"
                ? "setup"
                : "idle"
        }`}
      />
      <span style={{ minWidth: 0 }}>
        <div className="repo">{s.repo.split("/")[1] ?? s.repo}</div>
        <div className="sub">
          {s.branch ?? "default"} · {statusOf(s)}
        </div>
      </span>
      {tag && <span className="tag">{tag}</span>}
    </button>
  );

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>Switch session · {sessions.length} live</h2>
        <button className="btn outline" onClick={onNew}>
          <Plus size={14} /> New
        </button>
      </div>
      {sorted.needs.map((s) => row(s, "needs", "NEEDS YOU"))}
      {sorted.current && row(sorted.current, "current", "CURRENT")}
      {sorted.others.map((s) => row(s, "", null))}
    </Sheet>
  );
}

function SessionsRail({
  sessions,
  currentId,
  onPick,
  onBack,
}: {
  sessions: SessionInfo[];
  currentId: string;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const sorted = sortSessions(sessions);
  const groups: Array<{ label: string; items: SessionInfo[] }> = [
    { label: "Needs you", items: sorted.filter((s) => bucketOf(s) === "needs") },
    {
      label: "Running",
      items: sorted.filter((s) => bucketOf(s) === "running" || bucketOf(s) === "setup"),
    },
    { label: "Idle", items: sorted.filter((s) => bucketOf(s) === "idle") },
  ];
  return (
    <aside className="rail">
      <span className="brand">
        <CaveMark size={20} /> DI
      </span>
      <button className="btn primary wide" onClick={onBack}>
        <Plus size={14} /> New session
      </button>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className={g.label === "Needs you" ? "eyebrow accent" : "eyebrow"}>
              {g.label} · {g.items.length}
            </div>
            {g.items.map((s) => (
              <button
                key={s.id}
                className={`rail-row${s.id === currentId ? " active" : ""}${
                  s.needsYou ? " needs" : ""
                }`}
                onClick={() => onPick(s.id)}
              >
                <span
                  className={`dot ${
                    bucketOf(s) === "needs"
                      ? "needs"
                      : bucketOf(s) === "running"
                        ? "live"
                        : bucketOf(s) === "setup"
                          ? "setup"
                          : "idle"
                  }`}
                />
                <span className="repo">{s.repo.split("/")[1] ?? s.repo}</span>
                <span className="branch">{s.branch ?? ""}</span>
              </button>
            ))}
          </div>
        ))}
    </aside>
  );
}
