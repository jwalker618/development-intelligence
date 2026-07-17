import * as vscode from "vscode";
import { CavemanDial } from "./caveman";
import { ChatViewProvider } from "./chatPanel";
import { ControlPlane } from "./control";
import { ReviewItem, ReviewProvider } from "./review";
import { composeWorkspace } from "./workspace";

/**
 * Development Intelligence — the review-first paradigm layer. The heavy lifting (sessions,
 * headless Claude Code, caveman + RTK) lives in the control plane; this
 * extension gives it a VS Code-native face: agent panel, verbosity dial,
 * review queue, multi-repo workspaces.
 */
export function activate(ctx: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration("di");
  const control = new ControlPlane(ctx, (cfg.get<string>("serverUrl") ?? "").replace(/\/$/, ""));

  const chat = new ChatViewProvider(ctx, control);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("di.chat", chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

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
  );
}

export function deactivate(): void {
  /* subscriptions dispose automatically */
}
