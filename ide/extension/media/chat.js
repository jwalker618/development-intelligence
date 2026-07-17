/* Development Intelligence agent chat webview — vanilla JS mirror of the Grotto chat surface.
   Frames in (via extension host): hello, event, delta, status, approval_cleared, conn.
   Frames out: ready, send, approval, interrupt, signin. */
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");

  let events = [];
  let pending = null;
  let busy = false;
  let delta = "";
  let conn = "connecting";
  let repo = "";

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function inputPreview(input) {
    if (input && typeof input === "object") {
      for (const k of ["command", "file_path", "path", "url", "pattern"]) {
        if (typeof input[k] === "string") return input[k].slice(0, 400);
      }
      return JSON.stringify(input, null, 1).slice(0, 400);
    }
    return String(input).slice(0, 400);
  }

  const openCards = new Set();

  function render() {
    app.textContent = "";

    const scroll = h("div", "scroll");
    if (conn === "no-session") {
      scroll.appendChild(h("p", "empty", "No control-plane session matches this workspace. Create one from the phone app or the control room, or set di.sessionId."));
    } else if (conn === "unauthorized") {
      const box = h("div", "connect");
      box.appendChild(h("p", "", "Sign in to the Development Intelligence control plane to talk to the agent."));
      const btn = h("button", "btn primary", "Sign in");
      btn.onclick = () => vscode.postMessage({ t: "signin" });
      box.appendChild(btn);
      scroll.appendChild(box);
    } else if (events.length === 0) {
      scroll.appendChild(h("p", "empty", repo ? `Agent ready in ${repo}. Replies arrive caveman-compressed; approvals appear as buttons.` : "Connecting to the agent…"));
    }

    const outputs = new Map();
    for (const e of events) if (e.kind === "tool_done") outputs.set(String(e.toolUseId), e);

    for (const ev of events) {
      if (ev.kind === "user") scroll.appendChild(h("div", "msg user", ev.text));
      else if (ev.kind === "text") scroll.appendChild(h("div", "msg assistant", ev.text));
      else if (ev.kind === "error") scroll.appendChild(h("div", "err", ev.message));
      else if (ev.kind === "result") {
        const secs = Math.round(Number(ev.durationMs) / 100) / 10;
        scroll.appendChild(h("div", "result", (ev.ok ? "✓ " : "✗ ") + secs + "s" + (typeof ev.costUsd === "number" ? " · $" + ev.costUsd.toFixed(2) : "")));
      } else if (ev.kind === "tool") {
        const done = outputs.get(String(ev.toolUseId)) || null;
        const card = h("div", "tool" + (done && done.ok === false ? " failed" : ""));
        const head = h("button", "tool-head");
        head.appendChild(h("span", "tool-name", ev.name));
        if (ev.summary) head.appendChild(h("span", "tool-sum", ev.summary));
        head.appendChild(h("span", "dot " + (done ? (done.ok === false ? "bad" : "ok") : "live")));
        card.appendChild(head);
        const key = String(ev.toolUseId);
        if (openCards.has(key)) {
          const det = h("div", "tool-det");
          det.appendChild(h("pre", "", String(ev.input)));
          if (done) det.appendChild(h("pre", "", String(done.output) || "(empty)"));
          card.appendChild(det);
        }
        head.onclick = () => {
          openCards.has(key) ? openCards.delete(key) : openCards.add(key);
          render();
        };
        scroll.appendChild(card);
      }
    }

    if (delta) {
      const live = h("div", "msg assistant", delta);
      live.appendChild(h("span", "caret"));
      scroll.appendChild(live);
    } else if (busy) {
      const t = h("div", "typing");
      t.appendChild(h("i"));
      t.appendChild(h("i"));
      t.appendChild(h("i"));
      scroll.appendChild(t);
    }
    app.appendChild(scroll);

    if (pending) {
      const card = h("div", "approve");
      card.appendChild(h("div", "approve-title", pending.title || "Approve?"));
      if (pending.input != null) card.appendChild(h("pre", "approve-input", inputPreview(pending.input)));
      const row = h("div", "row");
      const mk = (label, decision, cls) => {
        const b = h("button", "btn " + cls, label);
        b.onclick = () => {
          vscode.postMessage({ t: "approval", id: pending.id, decision });
          pending = null;
          render();
        };
        return b;
      };
      row.appendChild(mk("Allow", "allow", "primary"));
      row.appendChild(mk("Always", "always", ""));
      row.appendChild(mk("Deny", "deny", "danger"));
      card.appendChild(row);
      app.appendChild(card);
    }

    const bar = h("div", "inputbar");
    const ta = h("textarea");
    ta.rows = 1;
    ta.placeholder = conn === "open" ? "Message the agent…" : "connecting…";
    ta.value = draft;
    ta.oninput = () => { draft = ta.value; };
    ta.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };
    const btn = h("button", "sendbtn" + (busy ? " stop" : ""), busy ? "■" : "↑");
    btn.onclick = () => (busy ? vscode.postMessage({ t: "interrupt" }) : submit());
    bar.appendChild(ta);
    bar.appendChild(btn);
    app.appendChild(bar);

    scroll.scrollTop = scroll.scrollHeight;
    function submit() {
      const text = draft.trim();
      if (!text) return;
      draft = "";
      vscode.postMessage({ t: "send", text });
      render();
    }
  }

  let draft = "";

  window.addEventListener("message", (e) => {
    const f = e.data;
    switch (f.t) {
      case "hello":
        events = f.events || [];
        busy = !!f.busy;
        pending = f.pendingApproval || null;
        delta = "";
        break;
      case "event": {
        const ev = f.event;
        events = events.filter((p) => p.seq !== ev.seq).concat([ev]);
        if (ev.kind === "text" || ev.kind === "result" || ev.kind === "error") delta = "";
        if (ev.kind === "approval") pending = ev;
        if (ev.kind === "approval_done") pending = null;
        break;
      }
      case "delta":
        delta += f.text || "";
        break;
      case "status":
        busy = !!f.busy;
        break;
      case "approval_cleared":
        if (pending && pending.id === f.id) pending = null;
        break;
      case "conn":
        conn = f.state;
        if (f.repo) repo = f.repo;
        break;
    }
    render();
  });

  render();
  vscode.postMessage({ t: "ready" });
})();
