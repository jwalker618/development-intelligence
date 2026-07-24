import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SessionInfo } from "../api";
import {
  SAMPLE, buildTree, mapSpanDiff, parseDiff, setCavemanMode, subscribeChat, toChanges, toDialMode, toTimeline,
  type ChatMsg, type ChatState, type Move, type TreeNode,
} from "./control";
import { seedState, type CavemanMode, type Hunk, type SessionState, type Verdict } from "./state";

export type Conn = "loading" | "connecting" | "live" | "offline" | "reauth" | "error";

export interface Live {
  state: SessionState;
  sessions: SessionInfo[];
  chat: ChatState;
  tree: TreeNode | null;
  activeDiff: { path: string; hunks: Hunk[]; moves: Move[]; truncated: boolean; binary: boolean } | null;
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
  setModel: (model: string) => void;
  refresh: () => void;
}

const is401 = (e: unknown) => e instanceof Error && /\b401\b/.test(e.message);

/** Live data for one session (chosen by the app). Also lists all sessions for
 *  the nav dropdown. Pass null before a session is chosen. */
export function useControl(sessionId: string | null): Live {
  const [state, setState] = useState<SessionState>(seedState);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [chat, setChat] = useState<ChatState>({ messages: [], busy: false, model: null, pendingApprovalId: null });
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [activeDiff, setActiveDiff] = useState<{ path: string; hunks: Hunk[]; moves: Move[]; truncated: boolean; binary: boolean } | null>(null);
  const [cavemanSavings, setCavemanSavings] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>("loading");
  const [error, setError] = useState<string | null>(null);
  const reviewed = useRef(new Set<string>());

  const guard = useCallback((e: unknown) => {
    if (is401(e)) { setConn("reauth"); return; }
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const [cav, git, log, treeRes, list] = await Promise.all([
        api.caveman(), api.gitStatus(id), api.gitLog(id), api.tree(id), api.sessions(),
      ]);
      setSessions(list);
      const info = list.find((s) => s.id === id);
      setCavemanSavings(cav.savings);
      setTree(buildTree(treeRes.files, info?.repo ?? "repo"));
      setState((prev) => ({
        ...prev,
        repoCount: list.length || 1,
        branch: git.branch || prev.branch,
        ahead: git.ahead, behind: git.behind,
        caveman: { mode: toDialMode(cav.mode), savedPct: prev.caveman.savedPct },
        timeline: toTimeline(log.entries),
        changes: toChanges(git, reviewed.current, info?.approval ?? null),
      }));
    } catch (e) { guard(e); }
  }, [guard]);

  // Load + subscribe whenever the chosen session changes.
  useEffect(() => {
    setActiveDiff(null);
    reviewed.current = new Set();
    if (!sessionId) { setConn("live"); return; }
    setConn("loading");
    let stop: (() => void) | undefined;
    void (async () => {
      await loadSession(sessionId);
      stop = subscribeChat(sessionId, {
        onState: (patch) => setChat((c) => ({ ...c, ...patch })),
        onEvent: (ev) => setChat((c) => ({ ...c, messages: [...c.messages, ...foldOne(ev)] })),
        onDelta: (text) => setChat((c) => appendDelta(c, text)),
        onConn: (cc) => setConn(cc),
      });
    })();
    return () => stop?.();
  }, [sessionId, loadSession]);

  // Mirror the caveman flag on a ~15s poll.
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
      setState((p) => ({ ...p, caveman: { ...p.caveman, mode: m } }));
      void (async () => {
        try { const d = await setCavemanMode(m === "off" ? null : m); setCavemanSavings(d.savings ?? null); setState((p) => ({ ...p, caveman: { ...p.caveman, mode: toDialMode(d.mode) } })); }
        catch (e) { guard(e); }
      })();
    },
    commitSync: () => { if (sessionId) void api.gitOp(sessionId, { op: "sync" }).then(() => loadSession(sessionId)).catch(guard); },
    selectChange: (path) => {
      if (!sessionId) return;
      void api.gitDiffSemantic(sessionId, path)
        .then((res) => { const m = mapSpanDiff(res); setActiveDiff({ path, ...m }); })
        // Fall back to the plain line diff if the semantic engine errors on this file.
        .catch((e) => {
          if (is401(e)) { setConn("reauth"); return; }
          void api.gitDiff(sessionId, path)
            .then(({ diff }) => setActiveDiff({ path, hunks: parseDiff(diff), moves: [], truncated: false, binary: false }))
            .catch(guard);
        });
    },
    markReviewed: (path) => { reviewed.current.add(path); setState((p) => ({ ...p, changes: p.changes.map((c) => c.path === path ? { ...c, reviewed: true } : c) })); },
    setVerdict: (path, hunk, v) => setActiveDiff((d) => d && d.path === path ? { ...d, hunks: d.hunks.map((h, i) => i === hunk ? { ...h, verdict: h.verdict === v ? null : v } : h) } : d),
    sendMessage: (text) => { if (sessionId && text.trim()) void api.chatMessage(sessionId, text).catch(guard); },
    resolveApproval: (id, decision) => { if (sessionId) void api.chatApproval(sessionId, id, decision).catch(guard); },
    interrupt: () => { if (sessionId) void api.chatInterrupt(sessionId).catch(guard); },
    setModel: (model) => { if (sessionId) { setChat((c) => ({ ...c, model })); void api.chatModel(sessionId, model).catch(guard); } },
    refresh: () => { if (sessionId) void loadSession(sessionId); },
  };

  return { state, sessions, chat, tree, activeDiff, cavemanSavings, sample: SAMPLE, conn, error, actions };
}

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
  if (last && last.role === "agent") return { ...c, messages: c.messages.slice(0, -1).concat({ ...last, text: last.text + text }) };
  return { ...c, messages: [...c.messages, { id: `d${c.messages.length}`, role: "agent", text }] };
}
