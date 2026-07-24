import crypto from "node:crypto";
import { writeClaudeToken, type GrottoConfig } from "./config.js";

/**
 * Self-contained Claude Code OAuth (PKCE) — replaces the fragile hidden-PTY
 * `claude setup-token`. We generate the verifier + authorize URL ourselves, the
 * user authorises and pastes back the code, and we exchange it for the
 * subscription token with a single HTTP POST that either returns the token or a
 * readable error — it never hangs the way the PTY did.
 *
 * These are the same public OAuth-client parameters Claude Code itself uses
 * (client is a native/public client, so there is no secret).
 */

// These match the CURRENT `claude setup-token` v2.1.x flow exactly (captured
// from the real authorize URL): claude.com host, platform.claude.com redirect,
// user:inference scope. The older claude.ai / console.anthropic.com values are
// rejected by this client_id with "Invalid request format".
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const SCOPE = "user:inference";
// Try the current host first, then the classic one; whichever answers wins.
const TOKEN_ENDPOINTS = [
  "https://platform.claude.com/v1/oauth/token",
  "https://console.anthropic.com/v1/oauth/token",
];

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface Pending {
  verifier: string;
  state: string;
}

export class ClaudeOAuth {
  private pending: Pending | null = null;

  constructor(private cfg: GrottoConfig) {}

  /** Begin: mint a PKCE verifier + the authorize URL to open in a browser. */
  start(): { url: string } {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    this.pending = { verifier, state };
    const q = new URLSearchParams({
      code: "true",
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    return { url: `${AUTHORIZE_URL}?${q.toString()}` };
  }

  /** Exchange the pasted code (often "code#state") for the subscription token. */
  async exchange(rawCode: string): Promise<{ ok: boolean; detail: string }> {
    if (!this.pending) return { ok: false, detail: "Start the sign-in first (no pending request)." };
    const [code, stateFromCode] = rawCode.trim().split("#");
    if (!code) return { ok: false, detail: "Empty code." };
    const body = JSON.stringify({
      grant_type: "authorization_code",
      code,
      state: stateFromCode || this.pending.state,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: this.pending.verifier,
    });

    let lastErr = "no endpoint reachable";
    for (const endpoint of TOKEN_ENDPOINTS) {
      try {
        // Hard timeout so a blocked/slow host fails fast instead of hanging.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            // Required by Claude Code's OAuth token endpoint (from its own consts).
            "anthropic-beta": "oauth-2025-04-20",
          },
          body,
          signal: ctrl.signal,
        }).finally(() => clearTimeout(t));
        const text = await res.text();
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
        const token = (data.access_token ?? data.accessToken) as string | undefined;
        if (res.ok && typeof token === "string" && token) {
          writeClaudeToken(this.cfg, token);
          this.pending = null;
          return { ok: true, detail: `Token minted and stored (${token.slice(0, 14)}…, ${token.length} chars).` };
        }
        lastErr = `${endpoint.split("/")[2]} → HTTP ${res.status}: ${text.slice(0, 200) || "(empty)"}`;
        // A 4xx from a reachable endpoint is authoritative (bad/expired code) —
        // don't bother trying the fallback host.
        if (res.status >= 400 && res.status < 500) break;
      } catch (e) {
        lastErr = `${endpoint.split("/")[2]} → ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return { ok: false, detail: `Exchange failed: ${lastErr}` };
  }
}
