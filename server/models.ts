import { query, type ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import { sessionEnv, type GrottoConfig } from "./config.js";

/**
 * Live model catalog.
 *
 * The picker used to be a hand-written array, which is exactly why it went
 * stale (it silently missed newly released models). The Agent SDK exposes the
 * authoritative list — including which effort levels each model supports — so
 * we ask it instead of guessing.
 *
 * Preference order:
 *  1. the running conversation's query (free — it's already initialised),
 *  2. a short-lived enumeration query (costs a subprocess spawn, so cached).
 */

export interface ModelRow {
  value: string;
  resolvedModel?: string;
  displayName: string;
  description: string;
  supportsEffort: boolean;
  supportedEffortLevels: string[];
}

export interface ModelCatalog {
  models: ModelRow[];
  source: "live" | "cache" | "fallback";
  error?: string;
}

const TTL_MS = 10 * 60_000;
const ENUMERATE_TIMEOUT_MS = 20_000;

/** Last resort only — shown with source:"fallback" so the UI can say so. */
const FALLBACK: ModelRow[] = [
  { value: "default", displayName: "Default", description: "The default model for your account", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high"] },
];

let cache: { at: number; rows: ModelRow[] } | null = null;
let inflight: Promise<ModelRow[]> | null = null;

function toRow(m: ModelInfo): ModelRow {
  return {
    value: m.value,
    resolvedModel: m.resolvedModel,
    displayName: m.displayName,
    description: m.description,
    supportsEffort: m.supportsEffort !== false,
    supportedEffortLevels: m.supportedEffortLevels ?? [],
  };
}

/** Spawn a throwaway query purely to read its catalog, then close it. */
async function enumerate(cfg: GrottoConfig): Promise<ModelRow[]> {
  const env = sessionEnv(cfg);
  // Latch: hand the query an input stream we never resolve, so it initialises
  // (which is all we need) without starting a turn or spending tokens.
  let release = (): void => undefined;
  const gate = new Promise<void>((r) => { release = () => r(); });
  async function* idle(): AsyncIterable<never> {
    await gate;
    return;
  }
  const q = query({
    prompt: idle() as never,
    options: { cwd: cfg.home, env, settingSources: ["user", "project"] },
  });
  const timer = setTimeout(() => { try { void q.interrupt(); } catch { /* noop */ } }, ENUMERATE_TIMEOUT_MS);
  try {
    const list = await q.supportedModels();
    return list.map(toRow);
  } finally {
    clearTimeout(timer);
    release();
    try {
      await q.close?.();
    } catch {
      /* best-effort teardown */
    }
  }
}

/**
 * @param live the running conversation's supportedModels() promise, if any —
 *   pass `null` when no chat is active. Never pass a Query or a chat object.
 */
export async function listModels(
  cfg: GrottoConfig,
  live: Promise<ModelInfo[]> | null,
  force = false,
): Promise<ModelCatalog> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return { models: cache.rows, source: "cache" };
  }
  if (live) {
    try {
      const rows = (await live).map(toRow);
      if (rows.length) {
        cache = { at: Date.now(), rows };
        return { models: rows, source: "live" };
      }
    } catch {
      /* fall through to a standalone enumeration */
    }
  }
  inflight ??= enumerate(cfg).finally(() => { inflight = null; });
  try {
    const rows = await inflight;
    if (rows.length) {
      cache = { at: Date.now(), rows };
      return { models: rows, source: "live" };
    }
    return { models: cache?.rows ?? FALLBACK, source: cache ? "cache" : "fallback" };
  } catch (e) {
    return {
      models: cache?.rows ?? FALLBACK,
      source: cache ? "cache" : "fallback",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function invalidateModels(): void {
  cache = null;
}

/** True when `id` is a value the catalog actually offers (alias or wire id). */
export function isKnownModel(rows: ModelRow[], id: string): boolean {
  return rows.some((r) => r.value === id || r.resolvedModel === id);
}
