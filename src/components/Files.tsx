import {
  AtSign,
  ChevronLeft,
  Copy,
  FilePlus,
  File as FileIcon,
  Folder,
  FolderPlus,
  MessageCircleQuestion,
  MoreHorizontal,
  Pencil,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DirEntry, type FileContent } from "../api";
import { Sheet } from "../ui";

interface Props {
  sessionId: string;
  /** Type an @file reference (optionally :start-end) into the terminal. */
  onAsk: (pin: string) => void;
}

type NameSheet =
  | { kind: "file" }
  | { kind: "folder" }
  | { kind: "rename"; from: string }
  | { kind: "delete"; target: string }
  | null;

export function Files({ sessionId, onAsk }: Props) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<NameSheet>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (p: string) => {
      try {
        setEntries(await api.files(sessionId, p));
        setPath(p);
        setFile(null);
        setActionsFor(null);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [sessionId],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  const full = (name: string) => (path ? `${path}/${name}` : name);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const open = async (name: string) => {
    try {
      setFile(await api.file(sessionId, full(name)));
      setError(null);
    } catch (e) {
      fail(e);
    }
  };

  const onUpload = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      for (const f of Array.from(list)) {
        await api.upload(sessionId, full(f.name), f);
      }
      await load(path);
    } catch (e) {
      fail(e);
    }
  };

  if (file) {
    return (
      <FileReview
        sessionId={sessionId}
        file={file}
        onAsk={onAsk}
        onBack={() => setFile(null)}
        onSaved={(content) => setFile({ ...file, content })}
      />
    );
  }

  const crumbs = path ? path.split("/") : [];

  return (
    <div className="card">
      <div className="row">
        <div className="crumbs">
          <button className="crumb" onClick={() => void load("")}>
            root
          </button>
          {crumbs.map((c, i) => (
            <button
              key={i}
              className="crumb"
              onClick={() => void load(crumbs.slice(0, i + 1).join("/"))}
            >
              / {c}
            </button>
          ))}
        </div>
        <button className="icon-btn" title="Upload" onClick={() => uploadRef.current?.click()}>
          <Upload size={16} />
        </button>
        <button className="icon-btn" title="New file" onClick={() => setSheet({ kind: "file" })}>
          <FilePlus size={16} />
        </button>
        <button
          className="icon-btn"
          title="New folder"
          onClick={() => setSheet({ kind: "folder" })}
        >
          <FolderPlus size={16} />
        </button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <div className="error">{error}</div>}

      {entries.map((e) => (
        <div key={e.name} className="file-item">
          <div className="file-line">
            <button
              className="file-row"
              onClick={() => (e.type === "dir" ? void load(full(e.name)) : void open(e.name))}
            >
              {e.type === "dir" ? <Folder size={15} /> : <FileIcon size={15} />}
              {e.name}
            </button>
            {e.type === "file" && (
              <button
                className="icon-btn"
                onClick={() => onAsk(full(e.name))}
                title="Type @reference into the terminal"
              >
                <AtSign size={14} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => setActionsFor(actionsFor === e.name ? null : e.name)}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
          {actionsFor === e.name && (
            <div className="btn-row file-actions pillup">
              <button
                className="btn"
                onClick={() => setSheet({ kind: "rename", from: full(e.name) })}
              >
                Rename / Move
              </button>
              <button
                className="btn danger"
                onClick={() => setSheet({ kind: "delete", target: full(e.name) })}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
      {entries.length === 0 && <p className="muted">Empty directory.</p>}

      {sheet && (
        <NameSheetView
          sheet={sheet}
          basePath={path}
          onClose={() => setSheet(null)}
          onDone={async (action) => {
            try {
              if (action.kind === "file") await api.saveFile(sessionId, action.value, "");
              if (action.kind === "folder") await api.mkdir(sessionId, action.value);
              if (action.kind === "rename") {
                await api.move(sessionId, action.from, action.value);
              }
              if (action.kind === "delete") await api.deletePath(sessionId, action.target);
              setSheet(null);
              await load(path);
            } catch (e) {
              fail(e);
              setSheet(null);
            }
          }}
        />
      )}
    </div>
  );
}

type NameAction =
  | { kind: "file" | "folder"; value: string }
  | { kind: "rename"; from: string; value: string }
  | { kind: "delete"; target: string };

function NameSheetView({
  sheet,
  basePath,
  onClose,
  onDone,
}: {
  sheet: Exclude<NameSheet, null>;
  basePath: string;
  onClose: () => void;
  onDone: (a: NameAction) => void;
}) {
  const initial =
    sheet.kind === "rename" ? sheet.from : basePath ? `${basePath}/` : "";
  const [value, setValue] = useState(initial);

  if (sheet.kind === "delete") {
    return (
      <Sheet onClose={onClose}>
        <div className="sheet-head">
          <h2>Delete {sheet.target}?</h2>
        </div>
        <p className="muted">Deletes from the workspace. Git history is unaffected.</p>
        <div className="btn-row">
          <button className="btn danger" onClick={() => onDone(sheet)}>
            Delete
          </button>
          <button className="btn" onClick={onClose}>
            Keep it
          </button>
        </div>
      </Sheet>
    );
  }

  const title =
    sheet.kind === "file" ? "New file" : sheet.kind === "folder" ? "New folder" : "Rename / Move";
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <h2>{title}</h2>
      </div>
      <input
        className="mono"
        autoFocus
        placeholder="path/name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onDone(
              sheet.kind === "rename"
                ? { kind: "rename", from: sheet.from, value: value.trim() }
                : { kind: sheet.kind, value: value.trim() },
            );
          }
        }}
      />
      <button
        className="btn primary wide"
        disabled={!value.trim() || (sheet.kind === "rename" && value.trim() === sheet.from)}
        onClick={() =>
          onDone(
            sheet.kind === "rename"
              ? { kind: "rename", from: sheet.from, value: value.trim() }
              : { kind: sheet.kind, value: value.trim() },
          )
        }
      >
        {title}
      </button>
    </Sheet>
  );
}

// ── file review (design 3b/3c): read, select a line range, add to prompt ────

function FileReview({
  sessionId,
  file,
  onAsk,
  onBack,
  onSaved,
}: {
  sessionId: string;
  file: FileContent;
  onAsk: (pin: string) => void;
  onBack: () => void;
  onSaved: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);

  const name = file.path.split("/").pop() ?? file.path;
  const ext = (name.split(".").pop() ?? "").toUpperCase();
  const lines = file.content.split("\n");
  const kb = (new Blob([file.content]).size / 1024).toFixed(1);

  const tapLine = (i: number) => {
    setSel((s) => {
      if (!s) return { a: i, b: i };
      if (s.a === s.b && i !== s.a) return { a: Math.min(s.a, i), b: Math.max(s.a, i) };
      return null;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveFile(sessionId, file.path, draft);
      onSaved(draft);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="review-head">
        <button className="icon-btn" onClick={onBack}>
          <ChevronLeft size={17} />
        </button>
        <span className="name">{name}</span>
        <span className="path">{file.path}</span>
        <button
          className="icon-btn"
          title="Copy path"
          onClick={() => void navigator.clipboard?.writeText(file.path)}
        >
          <Copy size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={() => onAsk(file.path)}
          title="Type @reference into the terminal"
        >
          <AtSign size={15} />
        </button>
      </div>

      <div className="review-meta">
        <span className="eyebrow">
          {ext || "FILE"} · {lines.length} lines · {kb} KB
        </span>
        <span style={{ flex: 1 }} />
        {!file.binary && !file.truncated && (
          <button
            className="btn ghost"
            onClick={() => {
              setDraft(file.content);
              setEditing((e) => !e);
            }}
          >
            <Pencil size={13} /> {editing ? "Review" : "Edit"}
          </button>
        )}
        {editing && (
          <button className="btn primary" disabled={saving || draft === file.content} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {file.truncated && <p className="muted">Truncated at 512 KB — read-only view.</p>}
      {file.binary ? (
        <p className="muted">Binary file — use @ to reference it in the terminal.</p>
      ) : editing ? (
        <textarea
          className="editor"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <>
          <div className="code-body">
            {lines.map((line, i) => {
              const selected = sel && i + 1 >= sel.a && i + 1 <= sel.b;
              return (
                <div
                  key={i}
                  className={selected ? "code-line sel" : "code-line"}
                  onClick={() => tapLine(i + 1)}
                >
                  <span className="ln">{i + 1}</span>
                  <span className="lc">{highlight(line)}</span>
                </div>
              );
            })}
          </div>
          {sel && (
            <button
              className="btn primary range-pill pillup"
              onClick={() => onAsk(`${file.path}:${sel.a}-${sel.b}`)}
            >
              Insert @lines {sel.a}–{sel.b} into terminal
            </button>
          )}
          <div className="btn-row">
            <button className="btn outline" style={{ flex: 1 }} onClick={() => onAsk(file.path)}>
              <MessageCircleQuestion size={14} /> Ask about this
            </button>
            <button
              className="btn"
              onClick={() => void navigator.clipboard?.writeText(file.path)}
            >
              <Copy size={14} /> Path
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Light single-line syntax colour: comments, strings, numbers, keywords.
const TOKEN_RE =
  /(\/\/.*$|#.*$)|(["'`])(?:\\.|(?!\2).)*?\2|\b\d+(?:\.\d+)?\b|\b(?:import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|extends|new|await|async|try|catch|throw|switch|case|default|break|continue|public|private|readonly|static|void|null|undefined|true|false|def|elif|lambda|pass|raise|with|as|in|not|and|or|is|None|True|False|fn|pub|impl|struct|enum|match|use|mod)\b/g;

function highlight(line: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const t = m[0];
    const cls = m[1]
      ? "tok-c"
      : /^["'`]/.test(t)
        ? "tok-s"
        : /^\d/.test(t)
          ? "tok-n"
          : "tok-k";
    out.push(
      <span key={m.index} className={cls}>
        {t}
      </span>,
    );
    last = m.index + t.length;
    if (m[1]) break; // comment runs to end of line
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length > 0 ? out : " ";
}
