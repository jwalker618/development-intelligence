import * as vscode from "vscode";

/**
 * Client for the Development Intelligence control plane (the Grotto server). The control plane
 * owns sessions (repo checkouts), caveman mode/savings, and Claude
 * subscription auth. The extension is a viewport — the token-economy stack
 * lives server-side, so every surface (this IDE, the phone PWA) inherits it.
 * The agent conversation in the IDE is the official Claude Code extension;
 * the control plane's chat API remains the phone PWA's surface.
 */

export interface SessionInfo {
  id: string;
  repo: string;
  branch: string | null;
  needsYou: boolean;
  approval: string | null;
  model: string | null;
}

export interface CavemanStatus {
  mode: string | null;
  savings: string | null;
}

export class ControlPlane {
  constructor(
    private readonly ctx: vscode.ExtensionContext,
    public readonly baseUrl: string,
  ) {}

  private async credential(): Promise<string> {
    return (await this.ctx.secrets.get("di.credential")) ?? "";
  }

  async signIn(): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      title: "Development Intelligence control plane token",
      prompt: `Master token or device credential for ${this.baseUrl}`,
      password: true,
      ignoreFocusOut: true,
    });
    if (!token) return false;
    // Exchange the master token for a revocable 30-day device credential when
    // possible; fall back to storing the value directly (it may already BE a
    // device credential).
    try {
      const res = await fetch(`${this.baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { credential?: string; mfaRequired?: boolean };
      if (data.mfaRequired) {
        const code = await vscode.window.showInputBox({
          title: "Two-factor code",
          prompt: "6-digit code from your authenticator",
          ignoreFocusOut: true,
        });
        const res2 = await fetch(`${this.baseUrl}/api/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code }),
        });
        const data2 = (await res2.json()) as { credential?: string };
        if (data2.credential) {
          await this.ctx.secrets.store("di.credential", data2.credential);
          return true;
        }
        return false;
      }
      await this.ctx.secrets.store("di.credential", data.credential ?? token);
      return true;
    } catch {
      await this.ctx.secrets.store("di.credential", token);
      return true;
    }
  }

  async req<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        authorization: `Bearer ${await this.credential()}`,
        ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  }

  sessions(): Promise<SessionInfo[]> {
    return this.req<SessionInfo[]>("/api/sessions");
  }

  caveman(): Promise<CavemanStatus> {
    return this.req<CavemanStatus>("/api/caveman");
  }

  setCavemanMode(mode: string | null): Promise<unknown> {
    return this.req("/api/caveman", { method: "POST", body: { mode } });
  }

}

/** Resolve which control-plane session a workspace folder belongs to.
 *  Throws on auth/network failure so the caller can show the sign-in state. */
export async function sessionForWorkspace(
  control: ControlPlane,
  explicitId: string,
): Promise<SessionInfo | null> {
  const sessions = await control.sessions();
  if (explicitId) return sessions.find((s) => s.id === explicitId) ?? null;
  // Session workspaces live at $GROTTO_HOME/sessions/<id> — match by dir name.
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const base = folder.uri.path.split("/").filter(Boolean).pop() ?? "";
    const hit = sessions.find((s) => s.id === base);
    if (hit) return hit;
  }
  return sessions[0] ?? null;
}
