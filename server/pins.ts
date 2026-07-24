import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { GrottoConfig } from "./config.js";

/**
 * Per-session pin store — the "keep this in context" list the Session rail
 * shows. Persisted as one JSON file per session under $GROTTO_HOME/pins so it
 * survives restarts (on Railway that's the /data volume). Small and append-ish;
 * no locking needed for a single-user control plane.
 */

export interface Pin {
  id: string;
  icon: string; // lucide name
  label: string;
  createdAt: number;
}

const MAX_PINS = 50;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class Pins {
  private dir: string;

  constructor(cfg: GrottoConfig) {
    this.dir = path.join(cfg.home, "pins");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(sessionId: string): string {
    if (!SAFE_ID.test(sessionId)) throw new Error("bad session id");
    return path.join(this.dir, `${sessionId}.json`);
  }

  list(sessionId: string): Pin[] {
    try {
      const arr = JSON.parse(fs.readFileSync(this.file(sessionId), "utf8")) as Pin[];
      return Array.isArray(arr) ? arr.filter(isPin) : [];
    } catch {
      return [];
    }
  }

  add(sessionId: string, icon: string, label: string): Pin {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("label required");
    const pins = this.list(sessionId);
    const pin: Pin = {
      id: crypto.randomBytes(6).toString("base64url"),
      icon: sanitizeIcon(icon),
      label: trimmed.slice(0, 200),
      createdAt: Date.now(),
    };
    // newest first, cap the list
    const next = [pin, ...pins].slice(0, MAX_PINS);
    this.write(sessionId, next);
    return pin;
  }

  remove(sessionId: string, id: string): Pin[] {
    const next = this.list(sessionId).filter((p) => p.id !== id);
    this.write(sessionId, next);
    return next;
  }

  /** Drop a session's pins when the session is closed. */
  clear(sessionId: string): void {
    try {
      fs.rmSync(this.file(sessionId), { force: true });
    } catch {
      /* best-effort */
    }
  }

  private write(sessionId: string, pins: Pin[]): void {
    fs.writeFileSync(this.file(sessionId), JSON.stringify(pins), { mode: 0o600 });
  }
}

function isPin(p: unknown): p is Pin {
  const o = p as Record<string, unknown>;
  return !!o && typeof o.id === "string" && typeof o.icon === "string" && typeof o.label === "string";
}

/** Keep icon names to the kebab-case lucide vocabulary the client can resolve. */
function sanitizeIcon(icon: string): string {
  const clean = (icon || "").trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(clean) ? clean : "pin";
}
