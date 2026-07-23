import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CavemanStatus, type SessionInfo } from "./api";

/** Brand mark — the cave arch from public/icon.svg, inner cut in the bg colour. */
export function CaveMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} className={className} aria-hidden>
      <path
        d="M20 108 L20 74 Q20 34 64 34 Q108 34 108 74 L108 108 Z"
        fill="#f97316"
      />
      <path
        d="M44 108 L44 84 Q44 62 64 62 Q84 62 84 84 L84 108 Z"
        fill="var(--bg, #12100e)"
      />
    </svg>
  );
}

/** Custom pickaxe glyph for the savings motif (2-stroke: handle + arc). */
export function Pickaxe({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M14 10 L4 20" />
      <path d="M7 5 Q14 2 19 7 Q21 12 19 17" />
    </svg>
  );
}

/** Bottom sheet with scrim; Escape and scrim-tap dismiss. */
export function Sheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog">
        {children}
      </div>
    </>
  );
}

// ── theme (System · Light · Dark; default dark) ─────────────────────────────

export type Theme = "dark" | "light";
export type ThemePref = "system" | "light" | "dark";

export function useTheme(): {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  theme: Theme;
  toggle: () => void;
} {
  const [pref, setPref] = useState<ThemePref>(
    () => (localStorage.getItem("grotto-theme") as ThemePref) || "dark",
  );
  const systemLight = useMediaQuery("(prefers-color-scheme: light)");
  const theme: Theme = pref === "system" ? (systemLight ? "light" : "dark") : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("grotto-theme", pref);
  }, [theme, pref]);
  const toggle = useCallback(
    () => setPref(theme === "dark" ? "light" : "dark"),
    [theme],
  );
  return { pref, setPref, theme, toggle };
}

// ── data hooks ──────────────────────────────────────────────────────────────

/** Poll the session list — powers the control room, rail, switcher, banner. */
export function useSessions(pollMs = 5000): {
  sessions: SessionInfo[];
  refresh: () => Promise<void>;
  error: string | null;
} {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSessions(await api.sessions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { sessions, refresh, error };
}

export function useCaveman(pollMs = 15_000): CavemanStatus | null {
  const [status, setStatus] = useState<CavemanStatus | null>(null);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const s = await api.caveman().catch(() => null);
      if (!stop) setStatus(s);
    };
    void poll();
    const t = setInterval(poll, pollMs);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pollMs]);
  return status;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

// ── session status buckets (control room / switcher / rail) ────────────────

export type Bucket = "needs" | "running" | "idle" | "setup";

export function bucketOf(s: SessionInfo): Bucket {
  if (s.needsYou) return "needs";
  if (s.setup === "running" || s.setup === "failed") return "setup";
  if (s.ptyLive) return "running";
  return "idle";
}

export function sortSessions(list: SessionInfo[]): SessionInfo[] {
  const rank: Record<Bucket, number> = { needs: 0, setup: 1, running: 2, idle: 3 };
  return [...list].sort(
    (a, b) => rank[bucketOf(a)] - rank[bucketOf(b)] || b.createdAt - a.createdAt,
  );
}

/** Client-side mirror of the server's approval heuristic, for the live terminal. */
export function detectApprovalClient(tail: string): { active: boolean; snippet: string | null } {
  // eslint-disable-next-line no-control-regex
  const text = tail.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|[\x00-\x08\x0b-\x1f\x7f]/g, "");
  const window = text.slice(-1500);
  if (!/\b1\.\s*Yes\b[\s\S]{0,400}\b(?:2|3)\.\s*(?:Yes|No)/.test(window)) {
    return { active: false, snippet: null };
  }
  const tool = window.match(/([A-Z]\w+\([^)\n]{1,100}\))/g);
  const ask = window.match(/Do you want to ([^\n?]{5,80})\??/);
  return {
    active: true,
    snippet: tool ? tool[tool.length - 1] : ask ? ask[1].trim() : null,
  };
}

/** Split a file reference that may carry a :start-end line range. */
export function splitPin(pin: string): { path: string; range: string | null } {
  const m = pin.match(/^(.*):(\d+-\d+)$/);
  return m ? { path: m[1], range: m[2] } : { path: pin, range: null };
}

/** Does the terminal tail end at a shell prompt (vs. inside claude's TUI)? */
export function looksLikeShellPrompt(tail: string): boolean {
  // eslint-disable-next-line no-control-regex
  const text = tail.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|[\x00-\x08\x0b-\x1f\x7f]/g, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return /[#$%❯>]\s*$/.test(last);
}

/** Debounce a rapidly-updating value (terminal tails). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    timer.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer.current);
  }, [value, ms]);
  return v;
}
