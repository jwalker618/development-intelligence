import fs from "node:fs";
import path from "node:path";
import type { GrottoConfig } from "./config.js";

/**
 * Per-turn usage ledger — the honest basis for the efficiency tiles.
 *
 * The RTK and caveman KPIs used to render invented numbers from seed data.
 * They are real features (RTK compresses tool output; caveman compresses the
 * model's prose), but we had no measurement, so the UI made one up.
 *
 * The SDK's result message carries REAL per-turn token, cache and cost figures.
 * We record each turn tagged with the caveman mode that was active for it, so
 * the product can show a measured comparison from the operator's OWN usage
 * ("ultra averages N fewer output tokens/turn than off") instead of a guess.
 * No counterfactual is fabricated: a mode with no recorded turns simply has no
 * number.
 */

export interface TurnUsage {
  at: number;
  /** caveman mode active for this turn ("off" when the flag is unset). */
  mode: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  costUsd: number;
  durationMs: number;
  contextWindow: number;
  /** true when the turn ended in error — excluded from averages. */
  error: boolean;
}

export interface ModeStat {
  mode: string;
  turns: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgCostUsd: number;
}

export interface UsageSummary {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  costUsd: number;
  /** cacheRead / (cacheRead + input) — real prompt-cache reuse. */
  cacheHitPct: number | null;
  byMode: ModeStat[];
  /** Populated only when at least two modes have turns recorded. */
  cavemanDelta: { best: string; worst: string; outputTokenReductionPct: number } | null;
  recent: TurnUsage[];
}

const MAX_TURNS = 500;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Coalesce: NonNullableUsage strips `| null` at the TYPE level only — the
 *  fields really can be null at runtime, and a naive ratio yields NaN. */
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export class UsageLedger {
  private dir: string;

  constructor(private cfg: GrottoConfig) {
    this.dir = path.join(cfg.home, "usage");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(sessionId: string): string {
    if (!SAFE_ID.test(sessionId)) throw new Error("bad session id");
    return path.join(this.dir, `${sessionId}.jsonl`);
  }

  record(sessionId: string, turn: TurnUsage): void {
    try {
      fs.appendFileSync(this.file(sessionId), JSON.stringify(turn) + "\n");
    } catch {
      /* metrics must never break a turn */
    }
  }

  list(sessionId: string): TurnUsage[] {
    try {
      return fs
        .readFileSync(this.file(sessionId), "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-MAX_TURNS)
        .map((l) => JSON.parse(l) as TurnUsage);
    } catch {
      return [];
    }
  }

  clear(sessionId: string): void {
    try {
      fs.rmSync(this.file(sessionId), { force: true });
    } catch {
      /* best-effort */
    }
  }

  summarize(sessionId: string): UsageSummary {
    const all = this.list(sessionId);
    const ok = all.filter((t) => !t.error);
    const sum = (f: (t: TurnUsage) => number) => ok.reduce((a, t) => a + f(t), 0);

    const inputTokens = sum((t) => t.inputTokens);
    const cacheReadTokens = sum((t) => t.cacheReadTokens);
    const cacheBase = inputTokens + cacheReadTokens;

    const modes = [...new Set(ok.map((t) => t.mode))];
    const byMode: ModeStat[] = modes
      .map((mode) => {
        const rows = ok.filter((t) => t.mode === mode);
        const avg = (f: (t: TurnUsage) => number) =>
          rows.length ? Math.round((rows.reduce((a, t) => a + f(t), 0) / rows.length) * 100) / 100 : 0;
        return {
          mode,
          turns: rows.length,
          avgOutputTokens: avg((t) => t.outputTokens),
          avgTotalTokens: avg((t) => t.inputTokens + t.outputTokens),
          avgCostUsd: avg((t) => t.costUsd),
        };
      })
      .sort((a, b) => b.turns - a.turns);

    // Only compare modes with a meaningful sample; never invent a baseline.
    const usable = byMode.filter((m) => m.turns >= 3 && m.avgOutputTokens > 0);
    let cavemanDelta: UsageSummary["cavemanDelta"] = null;
    if (usable.length >= 2) {
      const best = usable.reduce((a, b) => (b.avgOutputTokens < a.avgOutputTokens ? b : a));
      const worst = usable.reduce((a, b) => (b.avgOutputTokens > a.avgOutputTokens ? b : a));
      if (best.mode !== worst.mode) {
        cavemanDelta = {
          best: best.mode,
          worst: worst.mode,
          outputTokenReductionPct:
            Math.round(((worst.avgOutputTokens - best.avgOutputTokens) / worst.avgOutputTokens) * 1000) / 10,
        };
      }
    }

    return {
      turns: ok.length,
      inputTokens,
      outputTokens: sum((t) => t.outputTokens),
      cacheReadTokens,
      cacheCreateTokens: sum((t) => t.cacheCreateTokens),
      costUsd: Math.round(sum((t) => t.costUsd) * 10000) / 10000,
      cacheHitPct: cacheBase > 0 ? Math.round((cacheReadTokens / cacheBase) * 1000) / 10 : null,
      byMode,
      cavemanDelta,
      recent: ok.slice(-20).reverse(),
    };
  }
}

/** Build a TurnUsage from an SDK result message. Tolerant of missing fields. */
export function turnFromResult(
  msg: Record<string, unknown>,
  mode: string,
  model: string | null,
): TurnUsage {
  const u = (msg.usage ?? {}) as Record<string, unknown>;
  const models = (msg.modelUsage ?? {}) as Record<string, Record<string, unknown>>;
  // Prefer modelUsage (per-model, already normalised) and fall back to usage.
  let input = 0, output = 0, cacheRead = 0, cacheCreate = 0, ctx = 0;
  const entries = Object.values(models);
  if (entries.length) {
    for (const m of entries) {
      input += n(m.inputTokens);
      output += n(m.outputTokens);
      cacheRead += n(m.cacheReadInputTokens);
      cacheCreate += n(m.cacheCreationInputTokens);
      ctx = Math.max(ctx, n(m.contextWindow));
    }
  } else {
    input = n(u.input_tokens);
    output = n(u.output_tokens);
    cacheRead = n(u.cache_read_input_tokens);
    cacheCreate = n(u.cache_creation_input_tokens);
  }
  return {
    at: Date.now(),
    mode,
    model,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheCreateTokens: cacheCreate,
    costUsd: n(msg.total_cost_usd),
    durationMs: n(msg.duration_ms),
    contextWindow: ctx,
    error: msg.subtype !== "success",
  };
}
