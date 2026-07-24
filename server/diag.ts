/**
 * Standalone auth console served at /diag. Deliberately plain: no framework, no
 * build step, no dependency on the React app — so it works even when the PWA
 * doesn't. Every request is logged; every failure is shown in full. Its whole
 * job is to let the operator confirm, step by step, that access works.
 */
export const DIAG_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DI · Auth Console</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #070d15; color: #dce6f0; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 22px 18px 60px; }
  h1 { font-size: 19px; margin: 0 0 4px; letter-spacing: -.01em; }
  .sub { color: #7d93a8; font-size: 12.5px; margin-bottom: 22px; }
  .card { border: 1px solid #1d2c3d; border-radius: 12px; background: #0b1521; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #8fa7bd; margin: 0 0 12px; }
  .row { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; border-top: 1px solid #14212f; font-size: 13px; }
  .row:first-of-type { border-top: 0; }
  .dot { width: 9px; height: 9px; border-radius: 999px; flex: 0 0 auto; margin-top: 5px; background: #3a506a; }
  .ok .dot { background: #33c27f; } .warn .dot { background: #e0a53a; } .bad .dot { background: #e0523a; }
  .k { flex: 0 0 210px; color: #9fb3c8; }
  .v { flex: 1; min-width: 0; word-break: break-word; }
  .v .hint { display: block; color: #e0a53a; font-size: 12px; margin-top: 3px; }
  .bad .v .hint { color: #ef7a66; }
  label { display: block; font-size: 12px; color: #9fb3c8; margin: 10px 0 5px; }
  input { width: 100%; height: 40px; padding: 0 12px; border: 1px solid #24384f; border-radius: 9px; background: #08131f; color: #dce6f0; font: inherit; outline: none; }
  input:focus { border-color: #3a6ea5; }
  .btn { height: 40px; padding: 0 16px; border: 0; border-radius: 9px; background: #2f6ea5; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.secondary { background: #16273a; color: #b7c8d9; border: 1px solid #24384f; }
  .btn:disabled { opacity: .55; cursor: default; }
  .btns { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 14px; }
  .banner { padding: 10px 12px; border-radius: 9px; font-size: 13px; margin-top: 12px; display: none; }
  .banner.show { display: block; }
  .banner.good { background: #0d2417; border: 1px solid #1f5a3c; color: #8ff0b6; }
  .banner.err { background: #26110f; border: 1px solid #5a2620; color: #ffb3a6; }
  pre { margin: 0; padding: 12px; background: #050c14; border: 1px solid #14212f; border-radius: 9px; font: 11.5px/1.55 ui-monospace, Menlo, monospace; color: #9fb8cf; max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  a { color: #6fb4ff; }
  .muted { color: #6f8296; font-size: 12px; }
</style></head>
<body><div class="wrap">
  <h1>Development Intelligence · Auth Console</h1>
  <div class="sub">A plain, frameworkless page to get access working and confirm each step. Nothing here is cosmetic.</div>

  <div class="card">
    <h2>1 · Preflight <span class="muted" id="pf-status"></span></h2>
    <div id="preflight"><div class="muted">Running…</div></div>
    <div class="btns"><button class="btn secondary" onclick="preflight()">Re-run preflight</button></div>
  </div>

  <div class="card">
    <h2>2 · Log in</h2>
    <label>Master token <span class="muted">(the <code>GROTTO_TOKEN</code> value)</span></label>
    <input id="tok" type="password" placeholder="paste master token" autocomplete="off" />
    <div id="mfa-wrap" style="display:none">
      <label>MFA code <span class="muted">(6 digits, if MFA is enabled)</span></label>
      <input id="code" inputmode="numeric" placeholder="123456" autocomplete="off" />
    </div>
    <div class="btns">
      <button class="btn" id="login-btn" onclick="doLogin()">Log in</button>
      <button class="btn secondary" onclick="clearCred()">Clear stored credential</button>
    </div>
    <div class="banner" id="login-banner"></div>
  </div>

  <div class="card">
    <h2>3 · Confirm access</h2>
    <div class="muted">Checks the stored device credential against the server.</div>
    <div class="btns"><button class="btn" onclick="whoami()">Check access</button></div>
    <div class="banner" id="who-banner"></div>
  </div>

  <div class="card">
    <h2>4 · Claude token — create or paste</h2>
    <div class="muted">Get a token that bills your Claude <b>subscription</b> — you do NOT need to buy an API key. Two ways:</div>

    <label>A · Paste a token you already have <span class="muted">(recommended)</span></label>
    <div class="muted" style="margin-bottom:6px">
      On your OWN computer run <code>claude setup-token</code>, authorise in the browser, paste the code it asks for, and it prints a
      <b>token starting <code>sk-ant-oat01-</code> (~108 chars)</b> — paste THAT here. Not the short code from the browser.
      (An API key <code>sk-ant-api…</code> also works, pay-as-you-go.)
    </div>
    <input id="ctok" type="password" placeholder="sk-ant-oat01-… (~108 chars)" autocomplete="off" />
    <div class="btns">
      <button class="btn" onclick="storeToken()">Store token</button>
      <button class="btn secondary" onclick="clearClaudeToken()">Clear stored Claude token</button>
    </div>
    <div class="banner" id="ctok-banner"></div>

    <hr style="border:0;border-top:1px solid #14212f;margin:18px 0" />

    <label>B · Sign in here to mint a subscription token <span class="muted">(no CLI needed)</span></label>
    <div class="muted" style="margin-bottom:6px">Three steps: get a link → authorise in your browser → paste the code Claude shows you. The server swaps the code for the token directly.</div>
    <div class="btns"><button class="btn secondary" id="as-btn" onclick="oauthStart()">1 · Get sign-in link</button></div>
    <div id="auth-flow" style="display:none;margin-top:12px">
      <div class="muted">2) Open this URL, sign in with your Claude <b>subscription</b>, authorise, and copy the code it shows:</div>
      <input id="auth-url" readonly style="margin-top:6px" />
      <div class="btns">
        <button class="btn secondary" onclick="copyAuthUrl()">Copy URL</button>
        <button class="btn secondary" onclick="openAuthUrl()">Open URL</button>
      </div>
      <label>3) Paste the code Claude gives you (it may look like <code>xxxx#yyyy</code> — paste the whole thing)</label>
      <input id="auth-code" placeholder="paste authorization code" autocomplete="off" />
      <div class="btns">
        <button class="btn" id="ac-btn" onclick="oauthExchange()">Exchange for token</button>
      </div>
    </div>
    <div class="banner" id="auth-banner"></div>
  </div>

  <div class="card">
    <h2>5 · Confirm Claude auth</h2>
    <div class="muted">Runs a tiny real request through the agent's exact auth path (~10–25s). A pass here means chat will authenticate.</div>
    <div class="btns"><button class="btn" id="cv-btn" onclick="verifyClaude()">Test Claude auth</button></div>
    <div class="banner" id="cv-banner"></div>
  </div>

  <div class="card">
    <h2>Log</h2>
    <pre id="log"></pre>
  </div>
  <div class="muted">Back to the <a href="/">app</a>. Credential is stored in <code>localStorage["grotto-cred"]</code> — the app reads the same key.</div>
</div>
<script>
const CRED_KEY = "grotto-cred";
const $ = (id) => document.getElementById(id);
const now = () => new Date().toISOString().slice(11, 19);
function log(line) { const el = $("log"); el.textContent += "[" + now() + "] " + line + "\\n"; el.scrollTop = el.scrollHeight; }
function cred() { try { return localStorage.getItem(CRED_KEY) || ""; } catch { return ""; } }
function banner(id, ok, msg) { const el = $(id); el.className = "banner show " + (ok ? "good" : "err"); el.textContent = msg; }

async function call(path, opts) {
  const o = opts || {};
  const headers = Object.assign({}, o.headers || {});
  if (o.body) headers["content-type"] = "application/json";
  if (o.auth) headers["authorization"] = "Bearer " + cred();
  log((o.method || "GET") + " " + path + (o.auth ? " (auth)" : ""));
  let res, text, data;
  try {
    res = await fetch(path, { method: o.method || "GET", headers, body: o.body });
  } catch (e) { log("  network error: " + e); throw { network: true, message: String(e) }; }
  try { text = await res.text(); } catch (e) { text = ""; }
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  log("  -> " + res.status + " " + (text.length > 300 ? text.slice(0, 300) + "…" : text));
  return { status: res.status, ok: res.ok, data };
}

async function preflight() {
  $("preflight").innerHTML = '<div class="muted">Running…</div>';
  let r;
  try { r = await call("/api/preflight"); }
  catch (e) { $("preflight").innerHTML = '<div class="row bad"><span class="dot"></span><span class="v">Server unreachable — ' + (e.message || e) + '</span></div>'; return; }
  const d = r.data || {};
  const rows = [];
  const add = (state, k, v, hint) => rows.push('<div class="row ' + state + '"><span class="dot"></span><span class="k">' + k + '</span><span class="v">' + v + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</span></div>');
  add(r.ok ? "ok" : "bad", "Server", r.ok ? "reachable (HTTP " + r.status + ")" : "error " + r.status);
  if (d.tokenSource === "env") add("ok", "Master token (GROTTO_TOKEN)", "set via env — this is the token you type below");
  else add("bad", "Master token (GROTTO_TOKEN)", "NOT set — server generated a random token", "You cannot know a generated token → login will 401. Set GROTTO_TOKEN in Railway to a value you choose, redeploy, then use it here.");
  add(d.homeWritable ? "ok" : "bad", "Volume writable", d.homeWritable ? "yes — " + (d.home || "") : "NO — cannot write to " + (d.home || "volume"), d.homeWritable ? "" : "Credentials/token can't persist. Check the volume mount + GROTTO_HOME.");
  add(d.mfaEnabled ? "warn" : "ok", "MFA", d.mfaEnabled ? "enabled — a 6-digit code is required" : "disabled");
  if (!d.claudeTokenPresent) add("warn", "Claude token", "not stored yet — connect Claude or paste a token", "Login still works without it; needed only for chat.");
  else if (d.claudeTokenKind === "apikey") add("ok", "Claude token", "API key stored — " + (d.claudeTokenPreview || ""), "Sent as ANTHROPIC_API_KEY. If step 4 still 401s, the key is invalid or its org is inactive/unfunded.");
  else if (d.claudeTokenKind === "oauth") add("ok", "Claude token", "OAuth setup-token stored — " + (d.claudeTokenPreview || ""), "Sent as an OAuth bearer. If step 4 401s ('Invalid bearer token'), re-mint with claude setup-token (needs a Pro/Max plan).");
  else add("bad", "Claude token", "unrecognised value stored — " + (d.claudeTokenPreview || ""), "Not an sk-ant-oat… or sk-ant-api… token. Clear it and paste a real setup-token or API key.");
  add("ok", "Active credentials", String(d.activeLogins != null ? d.activeLogins : "?"));
  add(d.gitTokenSet ? "ok" : "warn", "Git token", d.gitTokenSet ? "set" : "not set — repo clone/push limited");
  $("preflight").innerHTML = rows.join("");
  $("pf-status").textContent = d.tokenSource === "env" ? "" : "· action needed";
}

async function doLogin() {
  const btn = $("login-btn"); btn.disabled = true;
  try {
    const token = $("tok").value.trim();
    const code = $("code").value.trim();
    if (!token) { banner("login-banner", false, "Enter the master token first."); return; }
    const body = JSON.stringify(code ? { token, code } : { token });
    let r;
    try { r = await call("/api/login", { method: "POST", body }); }
    catch (e) { banner("login-banner", false, "Network error reaching the server: " + (e.message || e)); return; }
    if (r.data && r.data.mfaRequired) { $("mfa-wrap").style.display = "block"; banner("login-banner", false, "MFA is on — enter the 6-digit code and log in again."); return; }
    if (!r.ok || !r.data.credential) {
      const extra = r.data && r.data.attemptsLeft != null ? " (" + r.data.attemptsLeft + " attempts left)" : "";
      banner("login-banner", false, "Login failed — HTTP " + r.status + ": " + ((r.data && r.data.error) || "unknown") + extra);
      return;
    }
    localStorage.setItem(CRED_KEY, r.data.credential);
    const exp = r.data.expiresAt ? new Date(r.data.expiresAt).toLocaleString() : "?";
    banner("login-banner", true, "Logged in. Credential stored (expires " + exp + "). Now run step 3 to confirm.");
    whoami();
  } finally { btn.disabled = false; }
}

async function whoami() {
  if (!cred()) { banner("who-banner", false, "No stored credential — log in first (step 2)."); return; }
  let r;
  try { r = await call("/api/whoami", { auth: true }); }
  catch (e) { banner("who-banner", false, "Network error: " + (e.message || e)); return; }
  if (r.ok && r.data.ok) banner("who-banner", true, "Access confirmed — credential valid via " + (r.data.via || "credential") + ". You can use the app.");
  else banner("who-banner", false, "Not authorized — HTTP " + r.status + ". The credential is missing/expired/invalid; log in again.");
}

async function verifyClaude() {
  const btn = $("cv-btn"); btn.disabled = true; banner("cv-banner", true, "Testing… this makes a real request and can take up to ~25s.");
  $("cv-banner").className = "banner show";
  try {
    if (!cred()) { banner("cv-banner", false, "Log in first (step 2)."); return; }
    let r;
    try { r = await call("/api/claude/verify", { auth: true }); }
    catch (e) { banner("cv-banner", false, "Network error: " + (e.message || e)); return; }
    if (r.status === 401) { banner("cv-banner", false, "Not authorized to the control plane (401) — log in again."); return; }
    if (r.ok && r.data.ok) banner("cv-banner", true, r.data.detail || "Claude authenticated.");
    else banner("cv-banner", false, "Claude auth FAILED: " + ((r.data && r.data.detail) || ("HTTP " + r.status)));
  } finally { btn.disabled = false; }
}

function clearCred() { try { localStorage.removeItem(CRED_KEY); localStorage.removeItem("grotto-token"); } catch {} banner("login-banner", true, "Stored credential cleared."); log("cleared stored credential"); }

async function storeToken() {
  if (!cred()) { banner("ctok-banner", false, "Log in first (step 2)."); return; }
  const t = $("ctok").value.trim();
  if (!t) { banner("ctok-banner", false, "Paste a token first."); return; }
  if (!/^sk-ant-/.test(t)) {
    banner("ctok-banner", false, "That doesn't look like a token — it's probably the authorization CODE from the browser. The TOKEN is what claude setup-token prints AFTER you paste the code: it starts with sk-ant-oat01- and is ~108 characters. Paste that instead. (Not stored.)");
    return;
  }
  if (/^sk-ant-oat/.test(t) && t.length < 90) {
    banner("ctok-banner", false, "That sk-ant-oat token looks too short (" + t.length + " chars; expected ~108) — likely truncated on copy. Re-copy the whole line. (Not stored.)");
    return;
  }
  let r;
  try { r = await call("/api/claude-token", { method: "PUT", auth: true, body: JSON.stringify({ token: t }) }); }
  catch (e) { banner("ctok-banner", false, "Network error: " + (e.message || e)); return; }
  if (r.ok) { $("ctok").value = ""; banner("ctok-banner", true, "Token stored. Re-running preflight; then run step 5 to verify."); preflight(); }
  else banner("ctok-banner", false, "Store failed — HTTP " + r.status + ": " + ((r.data && r.data.error) || "unknown"));
}

async function clearClaudeToken() {
  if (!cred()) { banner("ctok-banner", false, "Log in first (step 2)."); return; }
  try { await call("/api/claude-token", { method: "DELETE", auth: true }); banner("ctok-banner", true, "Claude token cleared."); preflight(); }
  catch (e) { banner("ctok-banner", false, "Network error: " + (e.message || e)); }
}

async function oauthStart() {
  if (!cred()) { banner("auth-banner", false, "Log in first (step 2)."); return; }
  const btn = $("as-btn"); btn.disabled = true;
  try {
    let r;
    try { r = await call("/api/claude-oauth/start", { method: "POST", auth: true }); }
    catch (e) { banner("auth-banner", false, "Network error: " + (e.message || e)); return; }
    if (!r.ok || !r.data.url) { banner("auth-banner", false, "Could not start — HTTP " + r.status + ": " + ((r.data && r.data.error) || "unknown")); return; }
    $("auth-url").value = r.data.url;
    $("auth-flow").style.display = "block";
    banner("auth-banner", true, "Open the URL, authorise with your subscription, then paste the code below and Exchange.");
  } finally { btn.disabled = false; }
}
async function oauthExchange() {
  const code = $("auth-code").value.trim();
  if (!code) { banner("auth-banner", false, "Paste the code first."); return; }
  const btn = $("ac-btn"); btn.disabled = true; banner("auth-banner", true, "Exchanging code for token…");
  try {
    let r;
    try { r = await call("/api/claude-oauth/exchange", { method: "POST", auth: true, body: JSON.stringify({ code: code }) }); }
    catch (e) { banner("auth-banner", false, "Network error: " + (e.message || e)); return; }
    if (r.ok && r.data.ok) { $("auth-code").value = ""; banner("auth-banner", true, (r.data.detail || "Token stored.") + " Run step 5 to verify."); preflight(); }
    else banner("auth-banner", false, (r.data && (r.data.detail || r.data.error)) || ("HTTP " + r.status));
  } finally { btn.disabled = false; }
}
function copyAuthUrl() { const v = $("auth-url").value; if (!v) return; try { navigator.clipboard.writeText(v); log("copied auth URL"); } catch { $("auth-url").select(); document.execCommand("copy"); } }
function openAuthUrl() { const v = $("auth-url").value; if (v) window.open(v, "_blank", "noopener"); }

preflight();
</script>
</body></html>`;
