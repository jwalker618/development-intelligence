import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Review queue — the heart of the review-first paradigm. Agent edits land as
 * working-tree changes; this view walks you through them: open a diff against
 * HEAD, revert a file you reject, mark a file reviewed. State is per-window;
 * accepting is just committing (Git tab / SCM view), rejecting is a revert.
 */

interface Changed {
  root: string; // workspace folder path
  rel: string; // repo-relative file path
  status: string; // porcelain XY
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

export class ReviewProvider implements vscode.TreeDataProvider<ReviewItem> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private reviewed = new Set<string>();
  private items: Changed[] = [];

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.refresh(), 800);
    };
    watcher.onDidChange(kick);
    watcher.onDidCreate(kick);
    watcher.onDidDelete(kick);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const found: Changed[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = folder.uri.fsPath;
      try {
        const out = await git(root, ["status", "--porcelain"]);
        for (const line of out.split("\n")) {
          if (!line.trim()) continue;
          const status = line.slice(0, 2).trim();
          const rel = line.slice(3).trim().replace(/^"|"$/g, "");
          found.push({ root, rel, status });
        }
      } catch {
        /* not a git repo — skip */
      }
    }
    this.items = found;
    this.emitter.fire();
  }

  private key(c: Changed): string {
    return `${c.root}::${c.rel}`;
  }

  markReviewed(item: ReviewItem): void {
    this.reviewed.add(this.key(item.change));
    this.emitter.fire();
  }

  async revert(item: ReviewItem): Promise<void> {
    const c = item.change;
    const pick = await vscode.window.showWarningMessage(
      `Revert ${c.rel}? Uncommitted changes to this file are discarded.`,
      { modal: true },
      "Revert",
    );
    if (pick !== "Revert") return;
    if (c.status === "??") {
      fs.rmSync(path.join(c.root, c.rel), { force: true });
    } else {
      await git(c.root, ["checkout", "--", c.rel]).catch(() => undefined);
    }
    await this.refresh();
  }

  async openDiff(item: ReviewItem): Promise<void> {
    const c = item.change;
    const abs = vscode.Uri.file(path.join(c.root, c.rel));
    if (c.status === "??") {
      await vscode.window.showTextDocument(abs);
      return;
    }
    // HEAD version → temp file, then a plain URI diff (renderer-agnostic).
    let head = "";
    try {
      head = await git(c.root, ["show", `HEAD:${c.rel}`]);
    } catch {
      /* new in index */
    }
    const tmp = path.join(os.tmpdir(), `di-head-${Date.now()}-${path.basename(c.rel)}`);
    fs.writeFileSync(tmp, head);
    await vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.file(tmp),
      abs,
      `${c.rel} (HEAD ↔ working)`,
    );
  }

  getTreeItem(el: ReviewItem): vscode.TreeItem {
    return el;
  }

  getChildren(el?: ReviewItem): ReviewItem[] {
    if (el) return [];
    const multi = (vscode.workspace.workspaceFolders ?? []).length > 1;
    return this.items.map((c) => {
      const item = new ReviewItem(c, multi);
      if (this.reviewed.has(this.key(c))) {
        item.description = "✓ reviewed";
        item.contextValue = "reviewed";
      }
      return item;
    });
  }

  get pendingCount(): number {
    return this.items.filter((c) => !this.reviewed.has(this.key(c))).length;
  }
}

export class ReviewItem extends vscode.TreeItem {
  constructor(
    readonly change: Changed,
    multiRoot: boolean,
  ) {
    super(change.rel, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "changed";
    this.description = change.status;
    if (multiRoot) this.description = `${path.basename(change.root)} · ${change.status}`;
    this.iconPath = new vscode.ThemeIcon(
      change.status === "??" ? "diff-added" : "diff-modified",
    );
    this.command = {
      command: "di.review.openDiff",
      title: "Open diff",
      arguments: [this],
    };
  }
}
