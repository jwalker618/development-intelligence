import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { ControlPlane } from "./control";

/**
 * Multi-repo workspaces: pick any set of control-plane sessions and open them
 * as one VS Code multi-root workspace. Directly serves "I frequently include
 * my generate-web repo with my other work" — each root keeps its own git,
 * review queue rows are labeled per repo, and the agent panel binds to the
 * primary (first) root's session.
 */
export async function composeWorkspace(control: ControlPlane): Promise<void> {
  let sessions;
  try {
    sessions = await control.sessions();
  } catch (e) {
    void vscode.window.showErrorMessage(
      `Control plane unreachable: ${e instanceof Error ? e.message : e}`,
    );
    return;
  }
  if (sessions.length === 0) {
    void vscode.window.showInformationMessage(
      "No sessions on the control plane yet — create one from the phone app or control room.",
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(
    sessions.map((s) => ({
      label: s.repo,
      description: s.branch ? `· ${s.branch}` : "",
      detail: s.needsYou ? "$(bell) needs you" : undefined,
      id: s.id,
    })),
    {
      title: "Compose workspace — pick the repos to work across",
      canPickMany: true,
    },
  );
  if (!picked || picked.length === 0) return;

  // Session workspaces live at $GROTTO_HOME/sessions/<id> on this machine
  // (the IDE runs in the same container as the control plane).
  const grottoHome = process.env.GROTTO_HOME ?? path.join(os.homedir(), ".grotto");
  const folders = picked.map((p) => ({
    name: p.label.split("/").pop() ?? p.label,
    path: path.join(grottoHome, "sessions", p.id),
  }));

  const missing = folders.filter((f) => !fs.existsSync(f.path));
  if (missing.length > 0) {
    void vscode.window.showErrorMessage(
      `Workspace dirs not found locally (${missing.map((m) => m.name).join(", ")}) — ` +
        "the IDE must run in the same environment as the control plane.",
    );
    return;
  }

  const wsDir = path.join(grottoHome, "workspaces");
  fs.mkdirSync(wsDir, { recursive: true });
  const name = folders.map((f) => f.name).join("+").slice(0, 80);
  const wsPath = path.join(wsDir, `${name}.code-workspace`);
  fs.writeFileSync(
    wsPath,
    JSON.stringify(
      {
        folders,
        settings: { "di.sessionId": picked[0].id },
      },
      null,
      2,
    ),
  );
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(wsPath), {
    forceNewWindow: false,
  });
}
