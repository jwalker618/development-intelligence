import { ChevronLeft, ChevronRight, ClipboardPaste, Keyboard, Link } from "lucide-react";
import { useState } from "react";

const KEYS: Array<{ label: string; seq: string }> = [
  { label: "Esc", seq: "\x1b" },
  { label: "Tab", seq: "\t" },
  { label: "^C", seq: "\x03" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "←", seq: "\x1b[D" },
  { label: "→", seq: "\x1b[C" },
  { label: "⏎", seq: "\r" },
];

/**
 * Thumb answers for Claude Code's approval dialogs (1 = yes, 2 = yes/always,
 * 3 = no). The floating approval card is the promoted path; these stay for
 * anything the heuristic misses. Outside a dialog they just type digits.
 */
const APPROVAL_KEYS: Array<{ label: string; seq: string; title: string }> = [
  { label: "✓ 1", seq: "1", title: "Approve (option 1)" },
  { label: "✓✓ 2", seq: "2", title: "Approve, don't ask again (option 2)" },
  { label: "✗ 3", seq: "3", title: "Reject (option 3)" },
];

interface Props {
  send: (d: string) => void;
  /** Focus the terminal (from a user gesture, so mobile opens the keyboard). */
  focusTerminal?: () => void;
  /** Open the Links sheet (URLs collected from the terminal buffer). */
  onShowLinks?: () => void;
  /** Paste the clipboard into the terminal (iOS can't paste into a canvas). */
  onPaste?: () => void;
}

/** Terminal controls: tucked key row, paste, type-here focus, links sheet. */
export function KeyBar({ send, focusTerminal, onShowLinks, onPaste }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div className="keybar pillup">
          {KEYS.map((k) => (
            <button key={k.label} className="key" onClick={() => send(k.seq)}>
              {k.label}
            </button>
          ))}
          <span className="key-divider" />
          {APPROVAL_KEYS.map((k) => (
            <button
              key={k.label}
              className="key approve"
              title={k.title}
              onClick={() => send(k.seq)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <div className="keys-handle-row">
        <button className="keys-handle" onClick={() => setOpen((o) => !o)}>
          <Keyboard size={13} />
          Terminal keys — Esc · ^C · ↑↓ · ⏎
          {open ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>
        <span style={{ display: "flex", gap: 6 }}>
          {onPaste && (
            <button
              className="keys-handle type-here"
              onClick={onPaste}
              title="Paste the clipboard into the terminal"
            >
              <ClipboardPaste size={12} /> Paste
            </button>
          )}
          {onShowLinks && (
            <button
              className="keys-handle type-here"
              onClick={onShowLinks}
              title="URLs from the terminal output — open or copy"
            >
              <Link size={12} /> Links
            </button>
          )}
          {focusTerminal && (
            <button
              className="keys-handle type-here"
              onClick={focusTerminal}
              title="Focus the terminal to type into it directly"
            >
              Type here
            </button>
          )}
        </span>
      </div>
    </>
  );
}
