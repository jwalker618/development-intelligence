import * as vscode from "vscode";
import { ControlPlane } from "./control";

/**
 * The verbosity dial. Caveman compresses agent output 65-75%; the mode is the
 * knob you tune constantly, so it lives in the status bar: one click, pick a
 * level, done. Savings ride along (⛏ lifetime tokens saved).
 */

const MODES: Array<{ mode: string | null; label: string; detail: string }> = [
  { mode: "ultra", label: "Ultra", detail: "maximum compression — terse fragments" },
  { mode: "full", label: "Full", detail: "the standard caveman voice (default)" },
  { mode: "lite", label: "Lite", detail: "light compression, fuller sentences" },
  { mode: null, label: "Off", detail: "normal prose — no compression" },
  { mode: "wenyan-full", label: "Wenyan", detail: "classical-Chinese-style ultra compression" },
];

export class CavemanDial {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval>;

  constructor(private control: ControlPlane) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    this.item.command = "di.setMode";
    this.item.tooltip = "Caveman verbosity — click to change";
    this.item.text = "$(pulse) caveman …";
    this.item.show();
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 6000);
  }

  private async poll(): Promise<void> {
    try {
      const s = await this.control.caveman();
      const mode = s.mode ? (s.mode === "full" ? "CAVEMAN" : `CAVEMAN:${s.mode.toUpperCase()}`) : "caveman off";
      const savings = s.savings ? ` ${s.savings}` : "";
      this.item.text = `$(flame) ${mode}${savings}`;
    } catch {
      this.item.text = "$(flame) caveman ?";
    }
  }

  async pick(): Promise<void> {
    const current = await this.control.caveman().catch(() => null);
    const picked = await vscode.window.showQuickPick(
      MODES.map((m) => ({
        label: (current?.mode ?? null) === m.mode ? `$(check) ${m.label}` : m.label,
        description: m.detail,
        mode: m.mode,
      })),
      { title: "Caveman verbosity", placeHolder: "How terse should the agent be?" },
    );
    if (!picked) return;
    try {
      await this.control.setCavemanMode(picked.mode);
      await this.poll();
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Couldn't set caveman mode: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.item.dispose();
  }
}
