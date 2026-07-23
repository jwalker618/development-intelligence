import { Check, Copy, Link, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "../ui";

/**
 * Links detected in the terminal buffer, isolated from TUI rendering.
 * Compact one-line rows (host + truncated path) so a long OAuth URL doesn't
 * eat the screen — tap to open, copy icon for the full URL.
 */
export function LinksSheet({
  scan,
  onClose,
}: {
  scan: () => string[];
  onClose: () => void;
}) {
  const [links, setLinks] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setLinks(scan());
  }, [scan]);

  const parts = (url: string): { host: string; rest: string } => {
    try {
      const u = new URL(url);
      return { host: u.host, rest: `${u.pathname}${u.search}${u.hash}` };
    } catch {
      return { host: url.replace(/^https?:\/\//, "").split("/")[0] ?? url, rest: "" };
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>Links in this terminal</h2>
        <button className="icon-btn" title="Re-scan" onClick={() => setLinks(scan())}>
          <RefreshCw size={15} />
        </button>
      </div>
      {links.length === 0 && (
        <p className="muted">
          No URLs found in the recent terminal output. Links appear here as the agent
          prints them (auth links, PRs, dev servers).
        </p>
      )}
      {links.map((url) => {
        const { host, rest } = parts(url);
        return (
          <div key={url} className="link-line">
            <button
              className="link-compact"
              title={url}
              onClick={() => window.open(url, "_blank", "noopener")}
            >
              <Link size={13} />
              <span className="link-host">{host}</span>
              {rest && rest !== "/" && <span className="link-rest">{rest}</span>}
            </button>
            <button
              className="icon-btn"
              title="Copy full URL"
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                setCopied(url);
                setTimeout(() => setCopied(null), 1500);
              }}
            >
              {copied === url ? (
                <Check size={14} style={{ color: "var(--ok-check)" }} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        );
      })}
      {links.length > 0 && (
        <p className="microcopy">Tap a link to open it · copy icon for the full URL.</p>
      )}
    </Sheet>
  );
}
