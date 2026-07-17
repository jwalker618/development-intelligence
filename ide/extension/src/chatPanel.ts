import * as vscode from "vscode";
import type WebSocket from "ws";
import { ControlPlane, sessionForWorkspace } from "./control";

/**
 * Agent chat view: the webview renders bubbles/tool cards/approval buttons;
 * the extension host owns the control-plane WebSocket (credential never
 * enters the webview) and relays frames both ways.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private disposed = false;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly control: ControlPlane,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage(async (msg: { t: string; [k: string]: unknown }) => {
      const id = this.sessionId;
      switch (msg.t) {
        case "ready":
          void this.connect();
          break;
        case "send":
          if (id) {
            await this.control
              .chatMessage(id, String(msg.text))
              .catch((e) => this.post({ t: "event", event: clientError(e) }));
          }
          break;
        case "approval":
          if (id) {
            await this.control
              .chatApproval(id, String(msg.id), String(msg.decision))
              .catch(() => undefined);
          }
          break;
        case "interrupt":
          if (id) await this.control.chatInterrupt(id).catch(() => undefined);
          break;
        case "signin": {
          const ok = await this.control.signIn();
          if (ok) void this.connect();
          break;
        }
      }
    });

    view.onDidDispose(() => {
      this.disposed = true;
      this.ws?.close();
    });
  }

  private post(frame: unknown): void {
    void this.view?.webview.postMessage(frame);
  }

  private async connect(): Promise<void> {
    this.ws?.close();
    const explicit = vscode.workspace.getConfiguration("di").get<string>("sessionId") ?? "";
    let session;
    try {
      session = await sessionForWorkspace(this.control, explicit);
    } catch (e) {
      this.post({ t: "conn", state: "unauthorized" });
      return;
    }
    if (!session) {
      this.post({ t: "conn", state: "no-session" });
      return;
    }
    this.sessionId = session.id;
    this.post({ t: "conn", state: "connecting", repo: session.repo });

    let ws: WebSocket;
    try {
      ws = await this.control.chatSocket(session.id);
    } catch {
      this.post({ t: "conn", state: "unauthorized" });
      return;
    }
    this.ws = ws;
    ws.on("open", () => this.post({ t: "conn", state: "open", repo: session.repo }));
    ws.on("message", (raw) => {
      try {
        this.post(JSON.parse(String(raw)));
      } catch {
        /* skip malformed frame */
      }
    });
    ws.on("close", () => {
      if (!this.disposed && this.ws === ws) {
        this.post({ t: "conn", state: "closed" });
        setTimeout(() => void this.connect(), 2500);
      }
    });
    ws.on("error", () => undefined);
  }

  private html(webview: vscode.Webview): string {
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "media", "chat.js"));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "media", "chat.css"));
    const nonce = Math.random().toString(36).slice(2);
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}">
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}

function clientError(e: unknown): Record<string, unknown> {
  return {
    seq: Date.now(),
    at: Date.now(),
    kind: "error",
    message: e instanceof Error ? e.message : String(e),
  };
}
