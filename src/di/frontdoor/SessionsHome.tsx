import { useEffect, useMemo, useState } from "react";
import { api, type SessionInfo } from "../../api";
import { Icon } from "../primitives";
import { DiMark } from "./SignalCard";

/** Sessions Home — the launcher that wraps the workbench (37a populated / 37b
 *  empty), plus the New-session flow (37c repo+branch / 37d provisioning /
 *  37e error). Wired to GET /api/repos + POST /api/sessions.
 *
 *  Adapted to the real backend: there is no list-branches endpoint, so the
 *  base branch is a typed field (default = repo default) rather than a fetched
 *  list; and provisioning is shown as one indeterminate step (the server
 *  clones+provisions inside the POST and doesn't stream sub-steps). */
export function SessionsHome({ onOpen, onSettings }: { onOpen: (id: string) => void; onSettings: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null); // repo → setup modal
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ repo: string; detail: string } | null>(null);
  const [leash, setLeash] = useState("default");
  const [expanded, setExpanded] = useState<string | null>(null);
  const MAX_REPOS = 6; // mirrors the server bound

  useEffect(() => {
    void api.sessions().then(setSessions).catch(() => setSessions([]));
    void api.repos().then((r) => setRepos(r.repos)).catch(() => setRepos([]));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = repos.filter((r) => r.toLowerCase().includes(q));
    if (/^[\w.-]+\/[\w.-]+$/.test(query.trim()) && !hits.includes(query.trim())) hits.unshift(query.trim());
    return hits.slice(0, 6);
  }, [query, repos]);

  const create = async (specs: Array<{ repo: string; branch: string | null }>) => {
    setPicked(null); setCreating(true); setError(null);
    try {
      const s = await api.createSession(specs);
      // The leash chosen in the pre-flight applies from turn one, not from the
      // first time the user opens the menu.
      if (leash !== "default") await api.setPermissionMode(s.id, leash).catch(() => undefined);
      setCreating(false);
      onOpen(s.id);
    } catch (e) {
      setCreating(false);
      setError({ repo: specs.map((x) => x.repo).join(", "), detail: e instanceof Error ? e.message : String(e) });
    }
  };

  const empty = sessions !== null && sessions.length === 0;

  return (
    <div className="di-app" style={{ display: "flex", flexDirection: "column",
      background: "radial-gradient(120% 80% at 50% -10%,#0d2c49 0%,#0a1f33 45%,#06111d 100%)" }}>
      {/* top bar */}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: "18px 24px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flex: 1 }}>
          <DiMark size={28} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em" }}>Development Intelligence</span>
        </span>
        <button className="di-btn" onClick={onSettings} aria-label="Settings" style={{ width: 34, height: 34, border: "1px solid var(--di-rule)", borderRadius: 10, background: "rgba(10,20,32,.5)", color: "var(--di-ink-mute)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="settings" size={15} />
        </button>
      </div>

      {/* hero: repo search */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: empty ? "center" : "flex-start", padding: empty ? "0 24px" : "20px 24px 0" }}>
        <div style={{ width: "100%", maxWidth: empty ? 520 : 560, textAlign: "center" }}>
          {empty && (
            <div style={{ width: 64, height: 64, margin: "0 auto 20px", borderRadius: 16, background: "rgba(11,26,42,.8)", border: "1px solid var(--di-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="git-branch" size={28} color="var(--di-info)" />
            </div>
          )}
          <div style={{ fontSize: 23, fontWeight: 600, color: "var(--di-ink)", letterSpacing: "-0.01em", marginBottom: empty ? 8 : 6 }}>
            {empty ? "No sessions yet" : "Start a session"}
          </div>
          <div style={{ fontSize: 13, color: "var(--di-ink-mute)", lineHeight: 1.55, marginBottom: empty ? 24 : 18 }}>
            {empty ? "A session pairs a repository with a Claude Code agent. Pick a repo to start your first one — cloning and setup happen automatically."
              : "Pick a repository and Claude Code gets to work."}
          </div>
          <RepoSearch query={query} setQuery={setQuery} matches={matches} onPick={setPicked} />
        </div>
      </div>

      {/* continue grid */}
      {sessions && sessions.length > 0 && (
        <div style={{ flex: "0 0 auto", padding: "0 40px 30px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <span className="di-eyebrow">Continue · {sessions.length} active</span>
            <span style={{ flex: 1, height: 1, background: "#24384f" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {sessions.slice(0, 8).map((s) => {
              const slots = s.repos ?? [];
              const extra = slots.slice(1);
              const open = expanded === s.id;
              return (
                <div key={s.id} className="di-qrow"
                  style={{ position: "relative", display: "flex", flexDirection: "column", gap: 7, padding: "13px 14px", borderRadius: 12, background: "#0d1f31", border: `1px solid ${s.needsYou ? "#5a3316" : "#24384f"}`, overflow: "hidden", textAlign: "left" }}>
                  {s.needsYou && <span style={{ position: "absolute", right: 11, top: 11, width: 7, height: 7, borderRadius: 999, background: "var(--di-spot)", boxShadow: "0 0 6px rgba(240,146,110,.8)" }} />}

                  {/* The primary gets the terminal glyph — it is where the
                      agent stands, not just the first repo in a list. */}
                  <button className="di-btn" onClick={() => onOpen(s.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}>
                    <Icon name="square-terminal" size={13} color={s.needsYou ? "var(--di-spot)" : "var(--di-ink-mute)"} />
                    <span className="di-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--di-ink)", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.repo.split("/").pop()}</span>
                  </button>

                  {/* Satellites are a second line, not a hover chip — the
                      phone has no hover (44d). */}
                  {extra.length > 0 && (
                    <button className="di-btn" onClick={() => setExpanded(open ? null : s.id)}
                      aria-expanded={open} aria-label={`${extra.length} more repositories`}
                      style={{ display: "flex", alignItems: open ? "flex-start" : "center", gap: 6, border: 0, background: "transparent", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}>
                      <Icon name="corner-down-right" size={11} color="#3e5670" style={{ flex: "0 0 auto", marginTop: open ? 3 : 0 }} />
                      <span className="di-mono" style={{ fontSize: 10.5, color: "#6f8296", flex: 1, minWidth: 0,
                        ...(open ? { whiteSpace: "normal", lineHeight: 1.6 } : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }}>
                        {extra.map((r) => r.name).join(" · ")}
                      </span>
                    </button>
                  )}

                  <div className="di-mono" style={{ fontSize: 10.5, color: "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(s.branch ?? "—")}{s.needsYou ? " · needs you" : s.ptyLive ? " · working" : " · idle"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {picked && <SetupModal first={picked} available={repos} max={MAX_REPOS} leash={leash} onLeash={setLeash} onCancel={() => setPicked(null)} onCreate={create} />}
      {creating && <Provisioning />}
      {error && <ProvisionError repo={error.repo} detail={error.detail} onBack={() => setError(null)} />}
    </div>
  );
}

function RepoSearch({ query, setQuery, matches, onPick }: { query: string; setQuery: (v: string) => void; matches: string[]; onPick: (r: string) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, height: 52, padding: "0 16px", border: "1px solid #34608c", borderRadius: 13, background: "rgba(11,26,42,.9)", boxShadow: "0 12px 32px -12px rgba(0,0,0,.7), 0 0 0 3px rgba(57,211,186,.12)" }}>
        <Icon name="search" size={17} color="var(--di-info)" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories or type owner/repo…" spellCheck={false}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) onPick(matches[0]); }}
          className="di-mono" style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 13.5 }} />
      </div>
      {matches.length > 0 && (
        <div style={{ position: "absolute", top: 58, left: 0, right: 0, zIndex: 5, border: "1px solid #2c5075", borderRadius: 12, background: "#0a1a2a", boxShadow: "0 30px 70px -18px rgba(0,0,0,.85)", padding: 6, textAlign: "left" }}>
          {matches.map((r) => (
            <button key={r} className="di-row di-btn" onClick={() => onPick(r)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 11px", borderRadius: 9, border: 0, background: "transparent", cursor: "pointer" }}>
              <Icon name="folder-git-2" size={14} color="var(--di-info)" />
              <span className="di-mono" style={{ fontSize: 12.5, color: "var(--di-ink)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r}</span>
              <Icon name="arrow-up" size={13} color="var(--di-ink-mute)" style={{ transform: "rotate(90deg)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Spec { repo: string; branch: string }

/**
 * New session — the workspace and its satellites (44a).
 *
 * The primary is not "first in a list"; it is a DIFFERENT OBJECT. It gets its
 * own coral card headed "the agent works here", showing the working-directory
 * path, and the others are indented beneath it under "also mounted" on a
 * hairline. Promotion is a button that says what it does — "Work here instead"
 * — because an up-arrow does not explain why the order matters.
 */
function SetupModal({ first, available, max, leash, onLeash, onCancel, onCreate }: {
  first: string;
  available: string[];
  max: number;
  leash: string;
  onLeash: (mode: string) => void;
  onCancel: () => void;
  onCreate: (specs: Array<{ repo: string; branch: string | null }>) => void;
}) {
  const [specs, setSpecs] = useState<Spec[]>([{ repo: first, branch: "" }]);
  const [adding, setAdding] = useState("");

  const chosen = specs.map((s) => s.repo);
  const suggestions = useMemo(() => {
    const q = adding.trim().toLowerCase();
    if (!q) return [];
    const hits = available.filter((r) => r.toLowerCase().includes(q) && !chosen.includes(r));
    const typed = adding.trim();
    if (/^[\w.-]+\/[\w.-]+$/.test(typed) && !hits.includes(typed) && !chosen.includes(typed)) hits.unshift(typed);
    return hits.slice(0, 5);
  }, [adding, available, chosen.join(",")]);

  const add = (repo: string) => {
    if (specs.length >= max || chosen.includes(repo)) return;
    setSpecs((p) => [...p, { repo, branch: "" }]);
    setAdding("");
  };
  const promote = (i: number) => setSpecs((p) => [p[i], ...p.filter((_, j) => j !== i)]);
  const submit = () => onCreate(specs.map((s) => ({ repo: s.repo, branch: s.branch.trim() || null })));

  const primary = specs[0];
  /** Short name, but qualified with its owner when two repos share one.
   *  acme/api and beta/api both reading "api" is worse than a longer label. */
  const shortName = (repo: string) => {
    const tail = repo.split("/").pop() ?? repo;
    const clash = specs.filter((x) => (x.repo.split("/").pop() ?? x.repo) === tail).length > 1;
    return clash ? repo : tail;
  };

  return (
    <>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(4,10,18,.72)", zIndex: 20 }} />
      <div className="di-menu" role="dialog" aria-modal style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 660, maxWidth: "calc(100% - 40px)", maxHeight: "calc(100% - 60px)", display: "flex", flexDirection: "column", border: "1px solid var(--di-rule)", borderRadius: 16, background: "#0a1a2a", boxShadow: "0 40px 90px -20px rgba(0,0,0,.85)", zIndex: 21, overflow: "hidden" }}>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 11, padding: "16px 20px", borderBottom: "1px solid #17293a" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--di-ink)", flex: 1 }}>New session</span>
          <button className="di-btn" onClick={onCancel} aria-label="Close" style={{ border: 0, background: "transparent", cursor: "pointer", display: "flex" }}><Icon name="x" size={17} color="var(--di-ink-mute)" /></button>
        </div>

        <div className="di-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px 4px" }}>
          <div className="di-eyebrow" style={{ fontSize: 9, color: "var(--di-spot)", marginBottom: 9 }}>The agent works here</div>

          {/* The workspace. Coral, because this is where the agent stands. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #5a3316", borderRadius: 12, background: "#1e1109", padding: "12px 13px" }}>
            <span style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, background: "#2a150c", border: "1px solid #5a3316", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="square-terminal" size={16} color="var(--di-spot)" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--di-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(primary.repo)}</div>
              <div className="di-mono" style={{ fontSize: 10.5, color: "#a08a5e" }}>working directory · ~/di/{shortName(primary.repo)}</div>
            </div>
            <BranchField value={primary.branch} onChange={(v) => setSpecs((p) => p.map((x, j) => (j === 0 ? { ...x, branch: v } : x)))} onEnter={submit} />
          </div>

          {/* Satellites, connected by a hairline so the relationship is drawn
              rather than implied by proximity. */}
          <div style={{ paddingLeft: 17, marginTop: 2, borderLeft: "1px solid #24384f", marginLeft: 17 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "11px 0 9px" }}>
              <span className="di-eyebrow" style={{ fontSize: 9 }}>Also mounted</span>
              <span style={{ fontSize: 11, color: "#6f8296" }}>readable and editable from the same conversation</span>
            </div>

            {specs.slice(1).map((sp, k) => {
              const i = k + 1;
              return (
                <div key={sp.repo} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #16334f", borderRadius: 11, background: "#0c1e30", padding: "10px 12px", marginBottom: 7 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--di-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(sp.repo)}</span>
                  <BranchField value={sp.branch} onChange={(v) => setSpecs((p) => p.map((x, j) => (j === i ? { ...x, branch: v } : x)))} onEnter={submit} />
                  <button className="di-btn" onClick={() => promote(i)}
                    style={{ flex: "0 0 auto", height: 30, padding: "0 12px", border: "1px solid #2c5075", borderRadius: 8, background: "#12283f", color: "var(--di-ink)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                    Work here instead
                  </button>
                  <button className="di-btn" onClick={() => setSpecs((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${sp.repo}`}
                    style={{ flex: "0 0 auto", border: 0, background: "transparent", cursor: "pointer", padding: 2, display: "flex" }}>
                    <Icon name="x" size={14} color="var(--di-ink-mute)" />
                  </button>
                </div>
              );
            })}

            {specs.length < max ? (
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, height: 40, padding: "0 12px", border: "1px dashed #2c5075", borderRadius: 10 }}>
                  <Icon name="search" size={14} color="var(--di-ink-mute)" />
                  <input value={adding} onChange={(e) => setAdding(e.target.value)} spellCheck={false}
                    onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) add(suggestions[0]); }}
                    placeholder="Add another repository…" aria-label="Add another repository"
                    className="di-mono" style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--di-ink)", fontSize: 12 }} />
                  <span className="di-mono" style={{ fontSize: 10.5, color: "#6f8296" }}>{specs.length} / {max}</span>
                </div>
                {suggestions.length > 0 && (
                  <div style={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 5, border: "1px solid #2c5075", borderRadius: 11, background: "#0a1a2a", boxShadow: "0 24px 60px -18px rgba(0,0,0,.85)", padding: 5 }}>
                    {suggestions.map((r) => (
                      <button key={r} className="di-row di-btn" onClick={() => add(r)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", borderRadius: 8, border: 0, background: "transparent", cursor: "pointer" }}>
                        <Icon name="folder-git-2" size={13} color="var(--di-info)" />
                        <span className="di-mono" style={{ fontSize: 12, color: "var(--di-ink)", flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "#6f8296", padding: "6px 2px" }}>Six is the most a session can mount.</div>
            )}
          </div>

          {/* The leash is set HERE too — this is the moment a phone-first user
              decides what happens while they are away (44a). */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #24384f", borderRadius: 12, background: "#0e2032", padding: "12px 13px", margin: "14px 0 4px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--di-ink)" }}>How should this run?</div>
              <div style={{ fontSize: 11.5, color: "#6f8296" }}>Set the leash now — you can change it mid-session.</div>
            </div>
            <PreflightLeash value={leash} onChange={onLeash} />
          </div>
        </div>

        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderTop: "1px solid #17293a" }}>
          <span style={{ flex: 1, fontSize: 11.5, color: "#6f8296", lineHeight: 1.5 }}>
            {specs.length === 1
              ? <>Each checkout gets its own worktree — your local clones are untouched.</>
              : <>The agent works in <b style={{ color: "var(--di-ink-soft)" }}>{shortName(primary.repo)}</b> and can read and edit the other {specs.length - 1} alongside it. Each checkout gets its own worktree — your local clones are untouched.</>}
          </span>
          <button className="di-btn" onClick={submit} style={{ flex: "0 0 auto", height: 42, padding: "0 20px", border: 0, borderRadius: 11, background: "var(--di-spot)", color: "#3a140a", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Create session
          </button>
        </div>
      </div>
    </>
  );
}

/** Branch stays inline but GHOSTED — dashed until it is actually set, so it
 *  never looks configured when it is on the default. */
function BranchField({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  const set = !!value.trim();
  return (
    <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 8,
      border: set ? "1px solid var(--di-rule-strong)" : "1px dashed #2c5075", background: set ? "#0e2032" : "transparent" }}>
      <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
        onKeyDown={(e) => e.key === "Enter" && onEnter()} placeholder="default branch" aria-label="Base branch"
        className="di-mono" style={{ width: 104, border: 0, background: "transparent", outline: "none", fontSize: 11.5, color: set ? "var(--di-ink)" : "#6f8296" }} />
    </div>
  );
}

/** The four leash modes, compact, for the pre-flight. */
const PREFLIGHT_MODES = [
  { id: "dontAsk", label: "Fail closed" },
  { id: "plan", label: "Plan first" },
  { id: "default", label: "Ask me" },
  { id: "acceptEdits", label: "Auto-accept edits" },
];

function PreflightLeash({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = PREFLIGHT_MODES.find((m) => m.id === value) ?? PREFLIGHT_MODES[2];
  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <button className="di-btn" onClick={() => setOpen((v) => !v)} aria-label="Leash for this session"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 13px", border: "1px solid #5a3316", borderRadius: 999, background: "#2a150c", cursor: "pointer" }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fbd0ba" }}>{cur.label}</span>
        <Icon name="chevron-down" size={12} color="var(--di-ink-mute)" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 22 }} />
          <div className="di-menu" style={{ position: "absolute", bottom: 40, right: 0, width: 200, zIndex: 23, border: "1px solid #2c5075", borderRadius: 11, background: "#0a1a2a", boxShadow: "0 24px 60px -18px rgba(0,0,0,.85)", padding: 6 }}>
            {PREFLIGHT_MODES.map((m) => (
              <button key={m.id} className="di-row di-btn" onClick={() => { onChange(m.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", borderRadius: 8, border: 0, background: m.id === value ? "#12283f" : "transparent", cursor: "pointer" }}>
                <Icon name={m.id === value ? "check-circle-2" : "circle"} size={14} color={m.id === value ? "var(--di-info)" : "#33475c"} />
                <span style={{ fontSize: 12, color: "var(--di-ink)", textAlign: "left" }}>{m.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Provisioning() {
  const steps = ["Cloning repository", "Provisioning container", "Starting Claude Code · checking hooks", "Warming the dev server"];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,10,18,.7)" }}>
      <div style={{ width: 480, maxWidth: "calc(100% - 40px)", border: "1px solid var(--di-rule)", borderRadius: 16, background: "rgba(9,20,33,.95)", boxShadow: "0 40px 90px -20px rgba(0,0,0,.85)", padding: "30px 30px 26px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--di-ink)", marginBottom: 6 }}>Setting up your workspace</div>
        <div style={{ fontSize: 13, color: "var(--di-ink-mute)", marginBottom: 18 }}>Cloning and provisioning — this runs once.</div>
        <div style={{ height: 4, borderRadius: 999, background: "#12283f", overflow: "hidden", marginBottom: 18 }}>
          <div style={{ width: "45%", height: "100%", background: "linear-gradient(90deg,#39d3ba,#f0926e)", animation: "di-pulse 1.6s infinite" }} />
        </div>
        <div style={{ borderTop: "1px solid #17293a" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0" }}>
              <span style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: 999, border: "2px solid var(--di-info)", borderTopColor: "transparent", display: "inline-block", animation: "di-spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13.5, color: "var(--di-ink-soft)", flex: 1 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProvisionError({ repo, detail, onBack }: { repo: string; detail: string; onBack: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,10,18,.7)" }}>
      <div style={{ width: 480, maxWidth: "calc(100% - 40px)", border: "1px solid #5a2626", borderRadius: 16, background: "rgba(20,12,12,.95)", boxShadow: "0 40px 90px -20px rgba(0,0,0,.85)", padding: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "#2a1414", border: "1px solid #5a2626", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="alert-octagon" size={19} color="var(--di-neg)" /></span>
          <div><div style={{ fontSize: 15, fontWeight: 600, color: "var(--di-ink)" }}>Couldn't create the session</div><div className="di-mono" style={{ fontSize: 11.5, color: "#c98a8a" }}>{repo}</div></div>
        </div>
        <div className="di-mono" style={{ fontSize: 11.5, color: "#e79b9b", lineHeight: 1.6, background: "#120a0a", border: "1px solid #3a1c1c", borderRadius: 9, padding: "12px 13px", marginBottom: 16 }}>{detail}</div>
        <button className="di-btn" onClick={onBack} style={{ width: "100%", height: 42, border: "1px solid var(--di-rule)", borderRadius: 11, background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Back</button>
      </div>
    </div>
  );
}
