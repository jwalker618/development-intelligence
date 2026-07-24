import { query } from "@anthropic-ai/claude-agent-sdk";
import { readClaudeToken, sessionEnv, type GrottoConfig } from "./config.js";

/**
 * Live Claude-auth check — reproduces the exact path the agent uses (same env,
 * same SDK) with a one-word prompt, so a PASS here means chat will authenticate.
 * Never throws: every failure is caught and returned as a readable reason.
 */
export async function verifyClaude(cfg: GrottoConfig): Promise<{ ok: boolean; detail: string }> {
  if (!readClaudeToken(cfg)) {
    return { ok: false, detail: "No Claude token stored yet. Connect Claude (guided) or paste a setup-token first." };
  }
  const env = { ...sessionEnv(cfg) };
  try {
    const q = query({
      prompt: "Reply with exactly the word: ok",
      options: {
        env,
        model: "claude-haiku-4-5-20251001",
        permissionMode: "dontAsk",
        maxTurns: 1,
        settingSources: [],
      },
    });
    const timer = setTimeout(() => { void q.interrupt().catch(() => undefined); }, 25_000);
    let text = "";
    let authError = "";
    try {
      for await (const m of q) {
        if (m.type === "assistant") {
          for (const b of m.message.content) if (b.type === "text") text += b.text;
        } else if (m.type === "result") {
          if (m.subtype !== "success" && "result" in m && typeof m.result === "string") authError = m.result;
          break;
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (authError) return { ok: false, detail: authError };
    return { ok: true, detail: `Authenticated — Claude replied: "${text.trim().slice(0, 80) || "(no text)"}"` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
