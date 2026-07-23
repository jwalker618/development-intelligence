import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  SAMPLE, buildTree, parseDiff, setCavemanMode, subscribeChat, toChanges, toDialMode, toTimeline,
  type ChatMsg, type ChatState, type TreeNode,
} from "./control";
import { seedState, type CavemanMode, type Hunk, type SessionState, type Verdict } from "./state";

export type Conn = "loading" | "nosession" | "connecting" | "live" | "offline" | "reauth" | "error";

export interface Live {
  state: SessionState;
  chat: ChatState;
  tree: TreeNode | null;
  activeDiff: { path: string; hunks: Hunk[] } | null;
  cavemanSavings: string | null;
  sample: typeof SAMPLE;
  conn: Conn;
  error: string | null;
  actions: Actions;
}

export interface Actions {
  setCaveman: (m: CavemanMode) => void;
  commitSync: () => void;
  selectChange: (path: string) => void;
  markReviewed: (path: string) => void;
  setVerdict: (path: string, hunk: number, v: Verdict) => void;
  sendMessage: (text: string) => void;
  resolveApproval: (id: string, decision: "allow" | "always" | "deny") => void;
  interrupt: () => void;
  refresh: () => void;
}

const is401 = (e: unknown) => e instanceof Error && /\b401\b/.test(e.message);

export function useControl(): Live {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<SessionState>(seedState);
  const [chat, setChat] = useState<ChatState>({ messages: [], busy: false, model: null, pendingApprovalId: null });
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [activeDiff, setActiveDiff] = useState<{ path: string; hunks: Hunk[] } | null>(null);
  const [cavemanSavings, setCavemanSavings] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>("loading");
  const [error, setError] = useState<string | null>(null);
  const reviewed = useRef(new Set<string>());
  const approvalTitle = useRef<string | null>(null);

  const guard = useCallback((e: unknown) => {
    if (is401(e)) { setConn("reauth"); return; }
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  // Load the git/caveman/tree slices for a session and build the view model.
  const loadSession = useCallback(async (id: string) => {
    try {
      const [cav, git, log, treeRes] = await Promise.all([
        api.caveman(), api.gitStatus(id), api.gitLog(id), api.tree(id),
      ]);
      const info = (await api.sessions()).find((s) => s.id === id);
      approvalTitle.current = info?.approval ?? null;
      setCavemanSavings(cav.savings);
      setTree(buildTree(treeRes.files, info?.repo ?? "repo"));
      setState((prev) => ({
        ...prev,
        repoCount: 1,
        branch: git.branch || prev.branch,
        ahead: git.ahead, behind: git.behind,
        caveman: { mode: toDialMode(cav.mode), savedPct: prev.caveman.savedPct },
        timeline: toTimeline(log.entries),
        changes: toChanges(git, reviewed.current, approvalTitle.current),
      }));
    } catch (e) { guard(e); }
  }, [guard]);

  // Bootstrap: find a session (first live one), then load + subscribe.
  useEffect(() => {
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const sessions = await api.sessions();
        if (sessions.length === 0) { setConn("nosession"); return; }
        const id = sessions[0].id;
        setSessionId(id);
        await loadSession(id);
        stop = subscribeChat(id, {
          onState: (patch) => setChat((c) => ({ ...c, ...patch })),
          onEvent: (ev) => setChat((c) => ({ ...c, messages: [...c.messages, ...foldOne(ev)] })),
          onDelta: (text) => setChat((c) => appendDelta(c, text)),
          onConn: (cc) => setConn(cc),
        });
      } catch (e) { guard(e); }
    })();
    return () => stop?.();
  }, [loadSession, guard]);

  // Mirror the caveman flag on a ~15s poll (design invariant).
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(async () => {
      try {
        const cav = await api.caveman();
        setCavemanSavings(cav.savings);
        setState((p) => ({ ...p, caveman: { ...p.caveman, mode: toDialMode(cav.mode) } }));
      } catch { /* transient */ }
    }, 15000);
    return () => clearInterval(t);
  }, [sessionId]);

  const actions: Actions = {
    setCaveman: (m) => {
      setState((p) => ({ ...p, caveman: { ...p.caveman, mode: m } })); // optimistic
      void (async () => {
        try {
          const data = await setCavemanMode(m === "off" ? null : m);
          setCavemanSavings(data.savings ?? null);
          setState((p) => ({ ...p, caveman: { ...p.caveman, mode: toDialMode(data.mode) } }));
        } catch (e) { guard(e); }
      })();
    },
    commitSync: () => {
      if (!sessionId) return;
      void (async () => {
        try { await api.gitOp(sessionId, { op: "sync" }); await loadSession(sessionId); }
        catch (e) { guard(e); }
      })();
    },
    selectChange: (path) => {
      if (!sessionId) return;
      void (async () => {
        try { const { diff } = await api.gitDiff(sessionId, path); setActiveDiff({ path, hunks: parseDiff(diff) }); }
        catch (e) { guard(e); }
      })();
    },
    markReviewed: (path) => {
      reviewed.current.add(path);
      setState((p) => ({ ...p, changes: p.changes.map((c) => c.path === path ? { ...c, reviewed: true } : c) }));
    },
    setVerdict: (path, hunk, v) => setActiveDiff((d) =>
      d && d.path === path ? { ...d, hunks: d.hunks.map((h, i) => i === hunk ? { ...h, verdict: h.verdict === v ? null : v } : h) } : d),
    sendMessage: (text) => { if (sessionId && text.trim()) void api.chatMessage(sessionId, text).catch(guard); },
    resolveApproval: (id, decision) => { if (sessionId) void api.chatApproval(sessionId, id, decision).catch(guard); },
    interrupt: () => { if (sessionId) void api.chatInterrupt(sessionId).catch(guard); },
    refresh: () => { if (sessionId) void loadSession(sessionId); },
  };

  return { state, chat, tree, activeDiff, cavemanSavings, sample: SAMPLE, conn, error, actions };
}

// event-fold helpers (kept out of render to avoid re-alloc churn)
function foldOne(ev: { kind?: string; [k: string]: unknown }): ChatMsg[] {
  const id = String(ev.seq ?? Math.floor(performance.now()));
  if (ev.kind === "user") return [{ id, role: "user", text: String(ev.text ?? "") }];
  if (ev.kind === "text") return [{ id, role: "agent", text: String(ev.text ?? "") }];
  if (ev.kind === "tool") return [{ id, role: "tool", text: String(ev.name ?? "tool"), file: ev.file as string | undefined }];
  if (ev.kind === "approval") return [{ id, role: "approval", text: String(ev.title ?? "Approval required"), approvalId: String(ev.id ?? "") }];
  return [];
}

function appendDelta(c: ChatState, text: string): ChatState {
  const last = c.messages[c.messages.length - 1];
  if (last && last.role === "agent") {
    const messages = c.messages.slice(0, -1).concat({ ...last, text: last.text + text });
    return { ...c, messages };
  }
  return { ...c, messages: [...c.messages, { id: `d${c.messages.length}`, role: "agent", text }] };
}
