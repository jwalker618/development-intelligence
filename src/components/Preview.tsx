import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { previewUrl } from "../api";

/**
 * Live preview of a dev server the agent started inside the session
 * environment. Grotto proxies /preview/:session/:port (HTTP + HMR websockets)
 * to 127.0.0.1:<port> in the container, so hot reload works.
 */
export function Preview({ sessionId }: { sessionId: string }) {
  const portKey = `grotto-preview-port-${sessionId}`;
  const [port, setPort] = useState(() => localStorage.getItem(portKey) ?? "5173");
  const [loadedPort, setLoadedPort] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const portNum = Number(port);
  const valid = Number.isInteger(portNum) && portNum >= 1024 && portNum <= 65535;

  const load = () => {
    if (!valid) return;
    localStorage.setItem(portKey, port);
    setLoadedPort(portNum);
    setNonce((n) => n + 1);
  };

  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <input
          inputMode="numeric"
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="port"
        />
        <button className="btn primary" disabled={!valid} onClick={load}>
          {loadedPort === portNum ? (
            <>
              <RefreshCw size={14} /> Reload
            </>
          ) : (
            "Load"
          )}
        </button>
        <button
          className="btn"
          disabled={!valid}
          onClick={() => window.open(previewUrl(sessionId, portNum), "_blank")}
          title="Open in a new tab"
        >
          <ExternalLink size={14} /> Open
        </button>
      </div>
      {loadedPort === null ? (
        <div className="preview-empty muted">
          <p>
            Start a dev server in the <strong>Agent</strong> tab (e.g. ask the agent to run
            <code> pnpm dev</code>), then load its port here.
          </p>
          <p>Hot reload works — file changes refresh this pane automatically.</p>
        </div>
      ) : (
        <iframe
          key={`${loadedPort}-${nonce}`}
          className="preview-frame"
          src={previewUrl(sessionId, loadedPort)}
          title="Live preview"
        />
      )}
    </div>
  );
}
