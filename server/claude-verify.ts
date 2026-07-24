import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeTokenInfo, readClaudeToken, sessionEnv, type GrottoConfig } from "./config.js";

/** Signs of an auth rejection the model may surface as ordinary text. */
const AUTH_FAIL_RE = /invalid bearer token|api error:?\s*401|authentication_error|unauthorized|401\b|invalid x-api-key|could not resolve authentication/i;

/**
 * Live Claude-auth check — reproduces the exact path the agent uses (same env,
 * same SDK) with a one-word prompt, so a PASS here means chat will authenticate.
 * Never throws: every failure is caught and returned as a readable reason.
 */
export async function verifyClaude(cfg: GrottoConfig): Promise<{ ok: boolean; detail: string }> {
  if (!readClaudeToken(cfg)) {
    return { ok: false, detail: "No Claude token stored yet. Connect Claude (guided) or paste a setup-token first." };
  }
  const info = claudeTokenInfo(cfg);
  const asKey = info.kind === "apikey" ? " (using it as an API key)" : info.kind === "oauth" ? " (using it as an OAuth bearer)" : "";
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
    const reply = text.trim();
    // The SDK sometimes surfaces an auth rejection as ordinary assistant text
    // instead of throwing — so a reply is NOT proof of success. Inspect it.
    if (authError || AUTH_FAIL_RE.test(reply)) {
      const raw = (authError || reply).slice(0, 160);
      const hint = info.kind === "oauth"
        ? " Your setup-token is being rejected — it may be expired/revoked, or the account lacks a Pro/Max plan. Re-mint with `claude setup-token`."
        : info.kind === "apikey"
          ? " Your API key is being rejected — check it's valid and the org is active/funded."
          : " The stored value isn't a recognised Anthropic token (expected sk-ant-oat… or sk-ant-api…).";
      return { ok: false, detail: `Rejected${asKey}: ${raw}.${hint}` };
    }
    return { ok: true, detail: `Authenticated${asKey} — Claude replied: "${reply.slice(0, 80) || "(no text)"}"` };
  } catch (e) {
    return { ok: false, detail: `${e instanceof Error ? e.message : String(e)}${asKey}` };
  }
}
