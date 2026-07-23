import * as vscode from "vscode";
import { CavemanDial } from "./caveman";
import { ControlPlane } from "./control";
import { ReviewItem, ReviewProvider } from "./review";
import { composeWorkspace } from "./workspace";

/**
 * Development Intelligence — the review-first paradigm layer. The heavy lifting (sessions,
 * headless Claude Code, caveman + RTK) lives in the control plane; this
 * extension gives it a VS Code-native face: verbosity dial, review queue,
 * multi-repo workspaces. The agent conversation itself is the official
 * Claude Code extension (anthropic.claude-code) — we hand off to it via its
 * vscode://anthropic.claude-code/open URI handler rather than shipping a
 * second chat surface.
 */
export function activate(ctx: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration("di");
  const control = new ControlPlane(ctx, (cfg.get<string>("serverUrl") ?? "").replace(/\/$/, ""));

  const review = new ReviewProvider();
  const reviewView = vscode.window.createTreeView("di.review", { treeDataProvider: review });
  ctx.subscriptions.push(reviewView);
  const updateBadge = () => {
    reviewView.badge =
      review.pendingCount > 0
        ? { value: review.pendingCount, tooltip: `${review.pendingCount} files to review` }
        : undefined;
  };
  ctx.subscriptions.push(review.onDidChangeTreeData(updateBadge));

  const dial = new CavemanDial(control);
  ctx.subscriptions.push(dial);

  ctx.subscriptions.push(
    vscode.commands.registerCommand("di.signIn", () => void control.signIn()),
    vscode.commands.registerCommand("di.setMode", () => void dial.pick()),
    vscode.commands.registerCommand("di.composeWorkspace", () => void composeWorkspace(control)),
    vscode.commands.registerCommand("di.review.refresh", () => void review.refresh()),
    vscode.commands.registerCommand("di.review.openDiff", (item: ReviewItem) =>
      void review.openDiff(item),
    ),
    vscode.commands.registerCommand("di.review.revert", (item: ReviewItem) =>
      void review.revert(item),
    ),
    vscode.commands.registerCommand("di.review.done", (item: ReviewItem) =>
      review.markReviewed(item),
    ),
    vscode.commands.registerCommand("di.review.askAgent", (item: ReviewItem) =>
      void askAgentToTighten(item),
    ),
  );
}

/**
 * Review-queue → agent handoff: open the official Claude Code panel with a
 * pre-filled prompt about this file. The URI handler is the extension's
 * documented public entry point; the prompt is pre-filled, not auto-sent, so
 * the user stays in control. If the handler isn't available (extension not
 * installed, or a web build without URI routing), fall back to the clipboard.
 */
async function askAgentToTighten(item: ReviewItem): Promise<void> {
  const prompt =
    `Review my uncommitted changes to ${item.change.rel} (diff the working tree against HEAD) ` +
    `and tighten them: keep the behavior, improve clarity and quality. Explain what you changed.`;
  const uri = vscode.Uri.parse(
    `vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(prompt)}`,
  );
  let opened = false;
  try {
    opened = await vscode.env.openExternal(uri);
  } catch {
    opened = false;
  }
  if (!opened) {
    await vscode.env.clipboard.writeText(prompt);
    void vscode.window.showInformationMessage(
      "Claude Code panel not reachable — prompt copied to clipboard. Paste it into the agent.",
    );
  }
}

export function deactivate(): void {
  /* subscriptions dispose automatically */
}
