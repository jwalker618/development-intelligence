import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatStatus, type ModelRow, type RewindResult, type RepoRef, type SearchHit, type SessionInfo, type UsageSummary } from "../api";
import {
  SAMPLE, buildTree, changeKey, mapSpanDiff, parseDiff, setCavemanMode, subscribeChat, toChanges, toDialMode, toTimeline,
  type ChatMsg, type ChatState, type Move, type TreeNode,
} from "./control";
import { seedState, type CavemanMode, type Hunk, type SessionState, type Verdict } from "./state";

export type Conn = "loading" | "connecting" | "live" | "offline" | "reauth" | "error";

export interface Live {
  state: SessionState;
  sessions: SessionInfo[];
  chat: ChatState;
  models: ModelRow[] | null;
  usage: UsageSummary | null;
  /** One root per checkout. Single-repo sessions have exactly one. */
  trees: TreeNode[];
  /** The primary checkout's tree — what every single-repo caller means. */
  tree: TreeNode | null;
  /** Checkouts in this session, primary first. Empty until the session loads. */
  repos: RepoRef[];
  /** Per-repo state while a Commit & sync runs, so the pre-flight in 44f shows
   *  what is actually happening rather than a single spinner. Null when idle. */
  syncing: Record<string, SyncState> | null;
  activeDiff: { path: string; repo?: string; hunks: Hunk[]; moves: Move[]; truncated: boolean; binary: boolean } | null;
  cavemanSavings: string | null;
  /** The CLI's own view of this session: context meter, account, inventories.
   *  Null until the first status read lands. */
  status: ChatStatus | null;
  sample: typeof SAMPLE;
  conn: Conn;
  error: string | null;
  actions: Actions;
}

export interface Actions {
  setCaveman: (m: CavemanMode) => void;
  commitSync: () => void;
  /** `repo` is the checkout handle; omit it for the primary. */
  selectChange: (path: string, repo?: string) => void;
  markReviewed: (path: string, repo?: string) => void;
  setVerdict: (path: string, hunk: number, v: Verdict) => void;
  addRepo: (repo: string, branch: string | null) => Promise<void>;
  removeRepo: (name: string) => Promise<void>;
  sendMessage: (text: string) => void;
  resolveApproval: (id: string, decision: "allow" | "always" | "deny" | "stop", input?: Record<string, unknown>) => void;
  interrupt: () => void;
  setModel: (model: string) => void;
  setEffort: (effort: string | null) => void;
  refreshModels: () => void;
  setPermissionMode: (mode: string) => void;
  setReadOnly: (on: boolean) => void;
  setBudget: (usd: number | null) => void;
  setMaxTurns: (turns: number | null) => void;
  refreshStatus: () => void;
  /** Preview what a rewind would restore. Never touches the disk. */
  previewRewind: (uuid: string) => Promise<RewindResult>;
  /** Actually restore. Only call after the user confirms a preview. */
  rewind: (uuid: string) => Promise<RewindResult>;
  addPin: (icon: string, label: string) => void;
  removePin: (id: string) => void;
  search: (q: string) => Promise<SearchHit[]>;
  refresh: () => void;
}

export type SyncState = "pushing" | "waiting" | "done" | "failed";

const is401 = (e: unknown) => e instanceof Error && /\b401\b/.test(e.message);

/** Live data for one session (chosen by the app). Also lists all sessions for
 *  the nav dropdown. Pass null before a session is chosen. */
export function useControl(sessionId: string | null): Live {
  const [state, setState] = useState<SessionState>(seedState);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [chat, setChat] = useState<ChatState>({
    messages: [], busy: false, model: null, activeModel: null, effort: null, pendingApprovalId: null,
    permissionMode: "default", readOnly: false, budgetUsd: null, signals: null, hooks: [], limits: null, tasks: [], thinkingTokens: 0, suggestion: null, maxTurns: null,
  });
  const [trees, setTrees] = useState<TreeNode[]>([]);
  const [repos, setRepos] = useState<RepoRef[]>([]);
  const [syncing, setSyncing] = useState<Record<string, SyncState> | null>(null);
  const [activeDiff, setActiveDiff] = useState<{ path: string; repo?: string; hunks: Hunk[]; moves: Move[]; truncated: boolean; binary: boolean } | null>(null);
  const [cavemanSavings, setCavemanSavings] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const statusFor = useRef<string | null>(null);
  const modelsFor = useRef<string | null>(null);
  const [conn, setConn] = useState<Conn>("loading");
  const [error, setError] = useState<string | null>(null);
  const reviewed = useRef(new Set<string>());

  const guard = useCallback((e: unknown) => {
    if (is401(e)) { setConn("reauth"); return; }
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const [cav, git, log, list, pinsRes, usageRes] = await Promise.all([
        api.caveman(), api.gitStatus(id, { all: true }), api.gitLog(id), api.sessions(), api.pins(id), api.usage(id).catch(() => null),
      ]);
      setSessions(list);
      if (usageRes) setUsage(usageRes);
      const info = list.find((s) => s.id === id);
      // A pre-multi-repo server omits `repos` — synthesise the single slot so
      // the rest of the UI has exactly one shape to render.
      const slots: RepoRef[] = info?.repos?.length
        ? info.repos
        : info
          ? [{ repo: info.repo, branch: info.branch, name: info.repo.split("/").pop() ?? "repo", status: "ready" }]
          : [];
      setRepos(slots);
      setCavemanSavings(cav.savings);
      // One tree per READY checkout. A failed clone has nothing to list; asking
      // for it would 404 and take the whole Files screen down with it.
      const ready = slots.filter((r) => r.status === "ready");
      const roots = await Promise.all(
        ready.map(async (r, i) => {
          const res = await api.tree(id, i === 0 ? undefined : r.name).catch(() => ({ files: [] as string[] }));
          return buildTree(res.files, r.name);
        }),
      );
      setTrees(roots);
      setState((prev) => ({
        ...prev,
        repoCount: slots.length || 1,
        branch: git.branch || prev.branch,
        ahead: git.ahead, behind: git.behind,
        caveman: { mode: toDialMode(cav.mode), savedPct: prev.caveman.savedPct },
        timeline: toTimeline(log.entries),
        changes: toChanges(git, reviewed.current, info?.approval ?? null),
        pins: pinsRes.pins.map((p) => ({ id: p.id, icon: p.icon, label: p.label })),
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
        onEvent: (ev) => setChat((c) => reconcile(c, ev)),
        onDelta: (text) => setChat((c) => appendDelta(c, text)),
        onUsage: (u) => setUsage(u),
        onHook: (run) => setChat((c) => ({ ...c, hooks: [...c.hooks, run].slice(-40) })),
        // A tool card the instant the model starts emitting the call, seconds
        // before the block completes. Keyed so the durable event replaces it.
        onToolStart: (toolUseId, name) => setChat((c) =>
          c.messages.some((m) => m.toolUseId === toolUseId)
            ? c
            : { ...c, messages: [...c.messages, { id: `t${toolUseId}`, role: "tool", text: name, toolUseId, provisional: true }] }),
        onToolElapsed: (toolUseId, seconds) => setChat((c) => ({
          ...c,
          messages: c.messages.map((m) => (m.toolUseId === toolUseId ? { ...m, elapsed: seconds } : m)),
        })),
        onConn: (cc) => setConn(cc),
      });
    })();
    return () => stop?.();
  }, [sessionId, loadSession]);

  // Live model catalog. Guarded against a slow response from a previous session
  // landing in the new one (a cold enumeration can take ~1s+).
  const loadModels = useCallback(async (id: string | null, force = false) => {
    modelsFor.current = id;
    try {
      const cat = await api.models(id ?? undefined, force);
      if (modelsFor.current === id) setModels(cat.models);
    } catch {
      if (modelsFor.current === id) setModels(null);
    }
  }, []);

  useEffect(() => { void loadModels(sessionId); }, [sessionId, loadModels]);

  // The CLI's own view of the session. `warm` starts the process so the context
  // meter and account are populated before the user's first message, not after.
  const loadStatus = useCallback(async (id: string | null, warm = false) => {
    statusFor.current = id;
    if (!id) { setStatus(null); return; }
    try {
      const st = await api.chatStatus(id, warm);
      if (statusFor.current === id) {
        setStatus(st);
        setChat((c) => ({
          ...c,
          permissionMode: st.permissionMode,
          readOnly: st.readOnly,
          budgetUsd: st.budgetUsd,
          signals: st.signals,
          hooks: st.hooks as ChatState["hooks"],
          limits: st.limits,
          tasks: st.tasks ?? [],
          thinkingTokens: st.thinkingTokens ?? 0,
          suggestion: st.suggestion ?? null,
          maxTurns: st.maxTurns ?? null,
        }));
      }
    } catch { if (statusFor.current === id) setStatus(null); }
  }, []);

  useEffect(() => { void loadStatus(sessionId, true); }, [sessionId, loadStatus]);

  // Refresh the context meter after each turn — it only moves when the agent
  // has said something, so this is cheaper and truer than polling on a timer.
  useEffect(() => {
    if (!sessionId || chat.busy) return;
    const t = setTimeout(() => void loadStatus(sessionId), 800);
    return () => clearTimeout(t);
  }, [sessionId, chat.busy, loadStatus]);

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
    // Sync EVERY checkout that has changes, not just the primary — in a
    // multi-repo session the agent's work is routinely spread across them, and
    // committing one silently would leave the rest behind. With no changes
    // anywhere we still sync the primary, so the button can push ahead commits.
    commitSync: () => {
      if (!sessionId) return;
      const dirty = new Set(state.changes.filter((c) => c.kind !== "approval").map((c) => c.repo));
      const targets = dirty.size ? [...dirty] : [undefined];
      // Name every target up front so the pre-flight can show "waiting" for the
      // ones that have not started — a queue the reviewer can see.
      const nameOf = (r: string | undefined) => r ?? repos[0]?.name ?? "repo";
      setSyncing(Object.fromEntries(targets.map((r) => [nameOf(r), "waiting" as SyncState])));
      void (async () => {
        const failures: string[] = [];
        // Sequential: these are pushes to the same remote host, and a partial
        // failure must name the repo that failed rather than a merged rejection.
        for (const repo of targets) {
          const name = nameOf(repo);
          setSyncing((p) => ({ ...p, [name]: "pushing" }));
          try {
            await api.gitOp(sessionId, { op: "sync" }, repo);
            setSyncing((p) => ({ ...p, [name]: "done" }));
          } catch (e) {
            setSyncing((p) => ({ ...p, [name]: "failed" }));
            if (is401(e)) { setConn("reauth"); setSyncing(null); return; }
            failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
            // The design states the rule and the UI must honour it: one repo at
            // a time, and the rest stop when one fails.
            break;
          }
        }
        await loadSession(sessionId);
        setError(failures.length ? failures.join(" · ") : null);
        // Leave the outcome up briefly so a failure is readable before the
        // dock collapses back to its idle state.
        setTimeout(() => setSyncing(null), failures.length ? 6000 : 1200);
      })();
    },
    selectChange: (path, repo) => {
      if (!sessionId) return;
      void api.gitDiffSemantic(sessionId, path, repo)
        .then((res) => { const m = mapSpanDiff(res); setActiveDiff({ path, repo, ...m }); })
        // Fall back to the plain line diff if the semantic engine errors on this file.
        .catch((e) => {
          if (is401(e)) { setConn("reauth"); return; }
          void api.gitDiff(sessionId, path, repo)
            .then(({ diff }) => setActiveDiff({ path, repo, hunks: parseDiff(diff), moves: [], truncated: false, binary: false }))
            .catch(guard);
        });
    },
    markReviewed: (path, repo) => {
      reviewed.current.add(changeKey({ path, repo }));
      setState((p) => ({ ...p, changes: p.changes.map((c) => c.path === path && c.repo === repo ? { ...c, reviewed: true } : c) }));
    },
    addRepo: async (repo, branch) => {
      if (!sessionId) return;
      try { await api.addRepo(sessionId, repo, branch); await loadSession(sessionId); }
      catch (e) { guard(e); throw e; }
    },
    removeRepo: async (name) => {
      if (!sessionId) return;
      try { await api.removeRepo(sessionId, name); await loadSession(sessionId); }
      catch (e) { guard(e); throw e; }
    },
    setVerdict: (path, hunk, v) => setActiveDiff((d) => d && d.path === path ? { ...d, hunks: d.hunks.map((h, i) => i === hunk ? { ...h, verdict: h.verdict === v ? null : v } : h) } : d),
    sendMessage: (text) => { if (sessionId && text.trim()) void api.chatMessage(sessionId, text).catch(guard); },
    resolveApproval: (id, decision, input) => { if (sessionId) void api.chatApproval(sessionId, id, decision, input).catch(guard); },
    interrupt: () => { if (sessionId) void api.chatInterrupt(sessionId).catch(guard); },
    setModel: (model) => { if (sessionId) { setChat((c) => ({ ...c, model })); void api.chatModel(sessionId, model).catch(guard); } },
    setEffort: (effort) => { if (sessionId) { setChat((c) => ({ ...c, effort })); void api.chatEffort(sessionId, effort).catch(guard); } },
    addPin: (icon, label) => {
      if (!sessionId || !label.trim()) return;
      void api.addPin(sessionId, icon, label).then(({ pin }) => {
        setState((p) => ({ ...p, pins: [{ id: pin.id, icon: pin.icon, label: pin.label }, ...p.pins] }));
      }).catch(guard);
    },
    removePin: (id) => {
      if (!sessionId) return;
      // optimistic — the server returns the new list, which we trust as truth.
      setState((p) => ({ ...p, pins: p.pins.filter((x) => x.id !== id) }));
      void api.removePin(sessionId, id).then(({ pins }) => {
        setState((p) => ({ ...p, pins: pins.map((x) => ({ id: x.id, icon: x.icon, label: x.label })) }));
      }).catch(guard);
    },
    search: (q) => sessionId ? api.searchTranscript(sessionId, q).then((r) => r.hits).catch(() => []) : Promise.resolve([]),
    refreshModels: () => { void loadModels(sessionId, true); },
    setPermissionMode: (mode) => {
      if (!sessionId) return;
      setChat((c) => ({ ...c, permissionMode: mode }));
      void api.setPermissionMode(sessionId, mode).then(() => loadStatus(sessionId)).catch(guard);
    },
    setReadOnly: (on) => {
      if (!sessionId) return;
      setChat((c) => ({ ...c, readOnly: on }));
      void api.setReadOnly(sessionId, on).then(() => loadStatus(sessionId)).catch(guard);
    },
    setMaxTurns: (turns) => {
      if (!sessionId) return;
      setChat((c) => ({ ...c, maxTurns: turns }));
      void api.setMaxTurns(sessionId, turns).then(() => loadStatus(sessionId)).catch(guard);
    },
    setBudget: (usd) => {
      if (!sessionId) return;
      setChat((c) => ({ ...c, budgetUsd: usd }));
      void api.setBudget(sessionId, usd).then(() => loadStatus(sessionId)).catch(guard);
    },
    refreshStatus: () => { void loadStatus(sessionId, true); },
    previewRewind: (uuid) => sessionId
      ? api.rewind(sessionId, uuid, true).catch((e) => ({ canRewind: false, error: e instanceof Error ? e.message : String(e) }))
      : Promise.resolve({ canRewind: false, error: "no session" }),
    rewind: (uuid) => sessionId
      ? api.rewind(sessionId, uuid, false)
          // The files move but the transcript does not, so the Changes screen
          // is now stale — reload it rather than leaving a phantom diff.
          .then(async (r) => { await loadSession(sessionId); return r; })
          .catch((e) => ({ canRewind: false, error: e instanceof Error ? e.message : String(e) }))
      : Promise.resolve({ canRewind: false, error: "no session" }),
    refresh: () => { if (sessionId) void loadSession(sessionId); },
  };

  return { state, sessions, chat, models, usage, trees, tree: trees[0] ?? null, repos, syncing, activeDiff, cavemanSavings, status, sample: SAMPLE, conn, error, actions };
}

function foldOne(ev: { kind?: string; [k: string]: unknown }): ChatMsg[] {
  const id = String(ev.seq ?? Math.floor(performance.now()));
  if (ev.kind === "user") return [{ id, role: "user", text: String(ev.text ?? "") }];
  if (ev.kind === "text") return [{ id, role: "agent", text: String(ev.text ?? "") }];
  if (ev.kind === "tool") return [{ id, role: "tool", text: String(ev.name ?? "tool"), file: ev.file as string | undefined }];
  if (ev.kind === "approval") return [{ id, role: "approval", text: String(ev.title ?? "Approval required"), approvalId: String(ev.id ?? ""), approval: {
      toolName: String(ev.toolName ?? "tool"),
      description: (ev.description as string) ?? null,
      blockedPath: (ev.blockedPath as string) ?? null,
      decisionReason: (ev.decisionReason as string) ?? null,
      agentID: (ev.agentID as string) ?? null,
      canAlways: !!ev.canAlways,
      input: (ev.input as Record<string, unknown>) ?? {},
    } }];
  return [];
}

function appendDelta(c: ChatState, text: string): ChatState {
  const last = c.messages[c.messages.length - 1];
  if (last && last.role === "agent" && last.streaming) {
    return { ...c, messages: c.messages.slice(0, -1).concat({ ...last, text: last.text + text }) };
  }
  return { ...c, messages: [...c.messages, { id: `d${c.messages.length}`, role: "agent", text, streaming: true }] };
}

/** Fold a durable event, reconciling with any bubble already built from deltas.
 *  Without this every streamed reply renders twice: once from the deltas, then
 *  again when the authoritative `text` event lands. */
function reconcile(c: ChatState, ev: { kind?: string; [k: string]: unknown }): ChatState {
  const next = foldOne(ev);
  if (!next.length) return c;
  const last = c.messages[c.messages.length - 1];
  if (ev.kind === "text" && last && last.role === "agent" && last.streaming) {
    // Same content, authoritative copy — replace, don't duplicate.
    return { ...c, messages: c.messages.slice(0, -1).concat({ ...next[0], streaming: false }) };
  }
  return { ...c, messages: [...c.messages, ...next] };
}
