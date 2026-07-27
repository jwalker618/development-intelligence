import { useMemo, useState } from "react";
import { Icon, RailTitle } from "../primitives";
import { RailDock, MainColumn } from "../Shell";
import { SampleChip } from "./Session";
import type { SAMPLE } from "../control";
import type { LiveTask } from "../control";
import type { SessionState, TaskManifest, TaskParam } from "../state";

/**
 * "Now · the agent is doing this" (46c).
 *
 * The agent's OWN subagents and background commands. Deliberately shaped
 * unlike the runbook palette below it: a rule-less list on the sunken panel,
 * pulsing dots, no cards and no chevrons — nothing here is configured by you,
 * and it disappears when it finishes.
 */
function InFlight({ live }: { live: LiveTask[] }) {
  const done = (t: LiveTask) => /complete|done|finish/i.test(t.status);
  const failed = (t: LiveTask) => /fail|error|cancel/i.test(t.status);
  const running = live.filter((t) => !done(t) && !failed(t));
  return (
    <div style={{ marginTop: 12 }}>
      <div className="di-eyebrow" style={{ marginBottom: 3, fontSize: 9, color: "var(--di-rail-hue)" }}>
        Now · the agent is doing this
      </div>
      <div style={{ fontSize: 10, color: "#6f8296", lineHeight: 1.45, marginBottom: 8 }}>
        Its own subagents and background commands. Nothing here is configured by you.
      </div>
      {running.length === 0 ? (
        /* The structure stays when nothing is running, so the boundary between
           the two registers is learned before it is needed (49d). */
        <div style={{ fontSize: 11, color: "#6f8296", padding: "2px 2px 4px", lineHeight: 1.5 }}>
          The agent isn't running anything. This section fills itself when it starts a subagent or a background command.
        </div>
      ) : (
        running.slice(-8).reverse().map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "5px 2px" }}>
            <span style={{ width: 6, height: 6, flex: "0 0 auto", marginTop: 5, borderRadius: 999, background: "var(--di-rail-hue)", animation: "di-pulse 1.6s infinite" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--di-ink)", lineHeight: 1.4 }}>{t.label}</span>
              <span className="di-mono" style={{ display: "block", fontSize: 9.5, color: "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.detail ?? t.status}
              </span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** The boundary is stated in words, not implied by a heading change (46c). */
function RegisterDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "14px 0 10px" }}>
      <span style={{ flex: 1, height: 1, background: "var(--di-rule)" }} />
      <span className="di-mono" style={{ fontSize: 9, color: "#3e5670" }}>different thing</span>
      <span style={{ flex: 1, height: 1, background: "var(--di-rule)" }} />
    </div>
  );
}

export function TasksScreen({ s, sample, live }: { s: SessionState; sample: typeof SAMPLE; live: LiveTask[] }) {
  // s.tasks is empty the moment this is driven by a live list — indexing [0]
  // and the non-null find() both crashed the screen.
  const [selectedId, setSelectedId] = useState<string | null>(s.tasks[0]?.id ?? null);
  const task = s.tasks.find((t) => t.id === selectedId) ?? s.tasks[0] ?? null;
  const groups = useMemo(() => {
    const g: Record<string, TaskManifest[]> = {};
    for (const t of s.tasks) (g[t.group] ??= []).push(t);
    return g;
  }, [s.tasks]);

  return (
    <>
      {/* ── rail: task palette ── */}
      <RailTitle style={{ position: "absolute", top: 52, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>Tasks</RailTitle>
      <div style={{ position: "absolute", top: 78, left: 0, width: 340, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", border: "1px solid var(--di-rail-row-border)", borderRadius: 9, background: "var(--di-rail-row-bg)" }}>
          <Icon name="search" size={14} color="var(--di-rail-hue)" />
          <span style={{ fontSize: 11.5, color: "#6f8296", flex: 1 }}>Search tasks…</span>
          <span className="di-mono" style={{ fontSize: 10, color: "#6f8296" }}>⌘K</span>
        </div>
        {/* Two shapes on one screen. Both answer "what is running", and they
            never share a shape — see RegisterDivider. */}
        <InFlight live={live} />
        <RegisterDivider />
        <div className="di-eyebrow" style={{ fontSize: 9, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
          Runbooks · you configure these{sample.tasks && <SampleChip />}
        </div>
        <div style={{ fontSize: 10, color: "#6f8296", lineHeight: 1.45 }}>
          Saved commands with typed parameters. They wait here until you run them.
        </div>
      </div>

      <div className="di-scroll" style={{ position: "absolute", top: 124, left: 0, width: 340, bottom: 56, boxSizing: "border-box", padding: "0 14px", zIndex: 5 }}>
        {Object.entries(groups).map(([group, tasks]) => (
          <div key={group}>
            <div className="di-eyebrow" style={{ padding: "8px 2px 8px" }}>{group}</div>
            {tasks.map((t) => {
              const active = t.id === selectedId;
              return (
                <button key={t.id} className="di-row di-btn" onClick={() => setSelectedId(t.id)}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                    padding: "9px 10px 9px 12px", borderRadius: 9, background: active ? "var(--di-rail-row-bg)" : "transparent",
                    border: active ? "1px solid var(--di-rail-row-border)" : "1px solid transparent", marginBottom: 4, cursor: "pointer", overflow: "hidden" }}>
                  {active && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--di-rail-hue)" }} />}
                  <Icon name={t.icon} size={14} color={t.destructive ? "var(--di-neg)" : "var(--di-rail-hue)"} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, color: "var(--di-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                    <span style={{ display: "block", fontSize: 9.5, color: "#6f8296", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</span>
                  </span>
                  {t.destructive && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--di-neg)", flex: "0 0 auto" }} title="Destructive" />}
                  <Icon name="play" size={13} color="var(--di-ink-mute)" />
                </button>
              );
            })}
          </div>
        ))}
        <div className="di-btn" style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 2px 2px", color: "#6f8296", cursor: "pointer" }}>
          <Icon name="plus" size={13} /><span style={{ fontSize: 11.5 }}>Save a runbook as a task</span>
        </div>
      </div>

      <RailDock style={{ padding: "9px 14px" }}>
        <div className="di-row di-btn" style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
          <Icon name="square-terminal" size={14} color="var(--di-ink-mute)" />
          <span style={{ fontSize: 11.5, color: "var(--di-ink-soft)", flex: 1 }}>Raw terminal</span>
          <span style={{ fontSize: 9.5, color: "#6f8296" }}>escape hatch</span>
          <Icon name="chevron-right" size={13} color="#6f8296" />
        </div>
      </RailDock>

      {/* ── main: task detail / param form ── */}
      <MainColumn style={{ background: "var(--di-canvas)" }}>
        <TaskDetail key={task.id} task={task} />
      </MainColumn>
    </>
  );
}

function TaskDetail({ task }: { task: TaskManifest }) {
  const [params, setParams] = useState<Record<string, number | boolean | string>>(
    Object.fromEntries(task.params.map((p) => [p.key, p.value])),
  );
  const [gate, setGate] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [ran, setRan] = useState<null | string>(null);

  const resolved = useMemo(() => renderCommand(task, params), [task, params]);
  const setParam = (k: string, v: number | boolean | string) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <>
      {/* header */}
      <div style={{ flex: "0 0 auto", padding: "16px 22px 14px", borderBottom: "1px solid var(--di-rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--di-ink)" }}>{task.name}</span>
          {task.destructive && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 20, padding: "0 9px", borderRadius: 999,
              background: "var(--di-destructive-soft)", border: "1px solid var(--di-destructive-border)", color: "var(--di-neg)", fontSize: 10, fontWeight: 600 }}>
              <Icon name="alert-triangle" size={11} />Destructive
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--di-pos)" }}>
            <Icon name="check-circle-2" size={13} />{task.setupStatus}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--di-ink-mute)", lineHeight: 1.5 }}>{task.description}</div>
      </div>

      <div className="di-scroll" style={{ flex: 1, padding: "16px 22px" }}>
        {task.params.length > 0 && (
          <>
            <div className="di-eyebrow" style={{ marginBottom: 10 }}>Parameters</div>
            {task.params.map((p) => (
              <ParamRow key={p.key} p={p} value={params[p.key]} onChange={(v) => setParam(p.key, v)} />
            ))}
          </>
        )}

        {task.secretRefs.length > 0 && (
          <>
            <div className="di-eyebrow" style={{ margin: "16px 0 10px" }}>Secrets</div>
            {task.secretRefs.map((sec) => (
              <div key={sec} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 12px", border: "1px dashed var(--di-secret-chip-border)",
                borderRadius: 10, background: "var(--di-secret-chip-bg)", marginRight: 8, marginBottom: 16 }}>
                <Icon name="lock" size={14} color="var(--di-ink-mute)" />
                <span className="di-mono" style={{ fontSize: 11.5, color: "var(--di-ink-soft)" }}>{sec}</span>
                <span style={{ fontSize: 10.5, color: "#6f8296" }}>from DI secrets · value hidden</span>
              </div>
            ))}
          </>
        )}

        <div className="di-eyebrow" style={{ marginBottom: 10 }}>Will run</div>
        <div style={{ border: "1px solid #22384a", borderRadius: 11, background: "#0b1622", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 13px", borderBottom: "1px solid #16273a", background: "#0d1b2a" }}>
            <span className="di-mono" style={{ color: "var(--di-info)", fontSize: 12 }}>$</span>
            <span className="di-mono" style={{ fontSize: 10.5, color: "#6f8296" }}>resolved · secrets masked</span>
          </div>
          <div className="di-mono" style={{ padding: "11px 13px", fontSize: 11.5, lineHeight: 1.75, color: "#8fa6b5", whiteSpace: "pre-wrap" }}>
            {resolved.map((seg, i) => <span key={i} style={{ color: seg.color }}>{seg.text}</span>)}
          </div>
        </div>

        {ran && (
          <div style={{ marginTop: 16, border: "1px solid #234a2e", borderRadius: 11, background: "#0d1b13", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--di-pos)" }}>
              <Icon name="loader" size={13} /><span>{ran}</span>
            </div>
          </div>
        )}
      </div>

      {/* footer: destructive → typed-challenge gate; else direct run */}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 14, padding: "13px 22px", borderTop: "1px solid var(--di-rule)", background: "var(--di-panel-alt)" }}>
        <span style={{ flex: 1, fontSize: 11.5, color: "var(--di-ink-soft)", lineHeight: 1.45 }}>
          {task.destructive
            ? "Destructive — you'll confirm by typing the service name before anything runs."
            : "Runs in the session container. Output streams here; you can interrupt any time."}
        </span>
        <button className="di-btn" onClick={() => (task.destructive ? setGate(true) : setRan("Running " + task.name + "…"))}
          style={{ flex: "0 0 auto", height: 40, padding: "0 20px", border: 0, borderRadius: 10, background: "var(--di-cta)", color: "#3a140a",
            fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon name={task.destructive ? "shield-alert" : "play"} size={16} />{task.destructive ? "Review & run" : "Run"}
        </button>
      </div>

      {gate && task.confirm && (
        <ConfirmGate
          task={task} resolved={resolved} challenge={challenge} setChallenge={setChallenge}
          onCancel={() => { setGate(false); setChallenge(""); }}
          onConfirm={() => { setGate(false); setChallenge(""); setRan("Running " + task.name + "…"); }}
        />
      )}
    </>
  );
}

function ParamRow({ p, value, onChange }: { p: TaskParam; value: number | boolean | string; onChange: (v: number | boolean | string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 13px",
      border: "1px solid #23415f", borderRadius: 10, background: "#0e2032", marginBottom: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div className="di-mono" style={{ fontSize: 12, color: "var(--di-ink)" }}>{p.label}</div>
        {p.hint && <div style={{ fontSize: 10.5, color: "#6f8296", marginTop: 1 }}>{p.hint}</div>}
      </div>
      {p.type === "bool" ? (
        <button className="di-btn" onClick={() => onChange(!(value as boolean))} aria-pressed={value as boolean} aria-label={p.label}
          style={{ width: 42, height: 24, borderRadius: 999, background: value ? "#1f8a5b" : "var(--di-surface-sunken)", position: "relative", flex: "0 0 auto", border: 0, cursor: "pointer" }}>
          <span style={{ position: "absolute", top: 2, left: value ? 20 : 2, width: 20, height: 20, borderRadius: 999, background: value ? "#eafff1" : "#6f8296", transition: "left var(--di-dur-fast) var(--di-ease)" }} />
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto", border: "1px solid var(--di-rule)", borderRadius: 8, overflow: "hidden" }}>
          <button className="di-btn" aria-label="decrease" onClick={() => onChange(Math.max(0, (value as number) - 1))}
            style={{ width: 28, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--di-ink-mute)", cursor: "pointer", border: 0, background: "transparent" }}>−</button>
          <span className="di-mono" style={{ width: 44, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--di-ink)", background: "#0a1826" }}>{value as number}</span>
          <button className="di-btn" aria-label="increase" onClick={() => onChange((value as number) + 1)}
            style={{ width: 28, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--di-ink-mute)", cursor: "pointer", border: 0, background: "transparent" }}>+</button>
        </div>
      )}
    </div>
  );
}

function ConfirmGate({ task, resolved, challenge, setChallenge, onCancel, onConfirm }: {
  task: TaskManifest; resolved: Seg[]; challenge: string; setChallenge: (v: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  const match = challenge.trim() === task.confirm!.expect;
  return (
    <>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(3,8,14,.72)", zIndex: 30 }} />
      <div className="di-menu" role="dialog" aria-modal style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 31,
        width: 520, maxWidth: "calc(100% - 40px)", background: "var(--di-surface)", border: "1px solid var(--di-destructive-border)", borderRadius: 14,
        boxShadow: "0 40px 90px -20px rgba(0,0,0,.85)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--di-rule)" }}>
          <Icon name="shield-alert" size={18} color="var(--di-neg)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--di-ink)" }}>Confirm destructive task</span>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {/* plain prose — never caveman voice */}
          <p style={{ margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.6, color: "var(--di-ink-soft)" }}>
            This will reset and reseed the <strong style={{ color: "var(--di-ink)" }}>DSI Postgres</strong> — existing rows are dropped and cannot be recovered. It runs against <span className="di-mono" style={{ color: "var(--di-neg)" }}>{task.confirm!.expect}</span>.
          </p>
          <div style={{ border: "1px solid #22384a", borderRadius: 10, background: "#0b1622", padding: "10px 12px", marginBottom: 14 }}>
            <div className="di-mono" style={{ fontSize: 11, lineHeight: 1.7, color: "#8fa6b5", whiteSpace: "pre-wrap" }}>
              {resolved.map((seg, i) => <span key={i} style={{ color: seg.color }}>{seg.text}</span>)}
            </div>
          </div>
          <label style={{ display: "block", fontSize: 11.5, color: "var(--di-ink-soft)", marginBottom: 7 }}>{task.confirm!.challenge}</label>
          <input autoFocus value={challenge} onChange={(e) => setChallenge(e.target.value)} placeholder={task.confirm!.expect}
            className="di-mono" spellCheck={false}
            style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${match ? "var(--di-pos)" : "var(--di-rule)"}`,
              background: "var(--di-surface-sunken)", color: "var(--di-ink)", fontSize: 12.5, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 18px" }}>
          <button className="di-btn" onClick={onCancel} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--di-rule)",
            background: "transparent", color: "var(--di-ink-soft)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button className="di-btn" disabled={!match} onClick={onConfirm}
            style={{ height: 38, padding: "0 18px", borderRadius: 9, border: 0, background: match ? "var(--di-neg)" : "#3a1e1e",
              color: match ? "#2a0d0d" : "#7a5555", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: match ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon name="database" size={14} />Reset &amp; reseed
          </button>
        </div>
      </div>
    </>
  );
}

// ── resolved-command rendering: fill params (green), mask secrets (amber) ────

interface Seg { text: string; color: string }

function renderCommand(task: TaskManifest, params: Record<string, number | boolean | string>): Seg[] {
  const base = "#8fa6b5";
  const segs: Seg[] = [];
  const re = /\$\{(param|secret):([^}]+)\}/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(task.runTemplate))) {
    if (m.index > last) segs.push({ text: task.runTemplate.slice(last, m.index), color: base });
    if (m[1] === "secret") {
      segs.push({ text: "••••••••", color: "var(--di-warn)" });
    } else {
      const v = params[m[2]];
      const shown = typeof v === "boolean" ? (v ? "1" : "0") : String(v);
      segs.push({ text: shown, color: "#a9f0b6" });
    }
    last = re.lastIndex;
  }
  if (last < task.runTemplate.length) segs.push({ text: task.runTemplate.slice(last), color: base });
  return segs;
}
