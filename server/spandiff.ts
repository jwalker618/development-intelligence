/**
 * Semantic span diff — the review-hero engine (replaces the raw line diff).
 *
 * Produces token-level ops (equal · insert · delete · replace) inline on a
 * changed line, plus first-class MOVE detection (a run of lines deleted here
 * and re-inserted unchanged elsewhere is reported once, not as +N/−N noise).
 *
 * Self-contained (no external "document-intelligence" service — that repo is
 * the DSI product, not a diff engine). Bounded so a giant file can't blow the
 * request: past LINE_CAP we fall back to a plain line diff.
 */

const LINE_CAP = 4000;

export interface SpanOp { kind: "equal" | "insert" | "delete"; text: string }
export interface SpanLine {
  no: number | null;
  kind: "context" | "add" | "del" | "replace";
  text?: string;
  ops?: SpanOp[];
}
export interface SpanHunk { header: string; lines: SpanLine[] }
export interface SpanMove { count: number; text: string; toLine: number }
export interface SpanDiff { hunks: SpanHunk[]; moves: SpanMove[]; add: number; del: number; truncated?: boolean }

type LineOp =
  | { t: "equal"; a: number; b: number }
  | { t: "del"; a: number }
  | { t: "ins"; b: number };

/** LCS over lines → a delete/insert/equal edit script. */
function lineLcs(a: string[], b: string[]): LineOp[] {
  const n = a.length, m = b.length;
  // DP table of LCS lengths. O(n*m) — bounded by LINE_CAP.
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: "equal", a: i, b: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", a: i }); i++; }
    else { ops.push({ t: "ins", b: j }); j++; }
  }
  while (i < n) ops.push({ t: "del", a: i++ });
  while (j < m) ops.push({ t: "ins", b: j++ });
  return ops;
}

/** Split a line into diffable tokens: words, whitespace, and punctuation. */
function tokenize(s: string): string[] {
  return s.match(/(\s+|[A-Za-z0-9_$]+|[^\sA-Za-z0-9_$])/g) ?? [];
}

/** Token-level diff of a replaced line → inline spans. */
function tokenDiff(oldLine: string, newLine: string): SpanOp[] {
  const a = tokenize(oldLine), b = tokenize(newLine);
  const edit = lineLcs(a, b);
  const ops: SpanOp[] = [];
  const push = (kind: SpanOp["kind"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += text;
    else ops.push({ kind, text });
  };
  for (const e of edit) {
    if (e.t === "equal") push("equal", a[e.a]);
    else if (e.t === "del") push("delete", a[e.a]);
    else push("insert", b[e.b]);
  }
  return ops;
}

export function semanticDiff(oldText: string, newText: string): SpanDiff {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];
  if (a.length > LINE_CAP || b.length > LINE_CAP) {
    return { ...lineFallback(a, b), truncated: true };
  }

  const edit = lineLcs(a, b);

  // ── move detection: pair identical (trimmed, non-trivial) del/ins lines ──
  const dels = edit.filter((e): e is { t: "del"; a: number } => e.t === "del");
  const inss = edit.filter((e): e is { t: "ins"; b: number } => e.t === "ins");
  const movedDel = new Set<number>(), movedIns = new Set<number>();
  const moves: SpanMove[] = [];
  const insByText = new Map<string, number[]>();
  for (const e of inss) {
    const key = b[e.b].trim();
    if (key.length < 3) continue;
    (insByText.get(key) ?? insByText.set(key, []).get(key)!).push(e.b);
  }
  for (const e of dels) {
    const key = a[e.a].trim();
    if (key.length < 3 || movedDel.has(e.a)) continue;
    const cands = insByText.get(key)?.filter((bi) => !movedIns.has(bi));
    if (cands && cands.length) {
      const bi = cands[0];
      movedDel.add(e.a); movedIns.add(bi);
      // group contiguous moved runs into one block
      const last = moves[moves.length - 1];
      if (last && last.toLine + last.count === bi + 1 && a[e.a - 1] !== undefined && movedDel.has(e.a - 1)) {
        last.count++;
      } else {
        moves.push({ count: 1, text: a[e.a].trim(), toLine: bi + 1 });
      }
    }
  }

  // ── build hunks, pairing adjacent del/ins (not moved) into replace spans ──
  const lines: SpanLine[] = [];
  let add = 0, del = 0, newNo = 0;
  for (let k = 0; k < edit.length; k++) {
    const e = edit[k];
    if (e.t === "equal") { newNo = e.b + 1; lines.push({ no: newNo, kind: "context", text: b[e.b] }); continue; }
    if (e.t === "del") {
      if (movedDel.has(e.a)) continue; // shown in the move block
      // look ahead for a matching insert to make a replace line
      const next = edit[k + 1];
      if (next && next.t === "ins" && !movedIns.has(next.b)) {
        newNo = next.b + 1;
        lines.push({ no: newNo, kind: "replace", ops: tokenDiff(a[e.a], b[next.b]) });
        add++; del++; k++; // consume the insert
      } else { del++; lines.push({ no: null, kind: "del", text: a[e.a] }); }
      continue;
    }
    // insert
    if (movedIns.has(e.b)) continue;
    newNo = e.b + 1; add++; lines.push({ no: newNo, kind: "add", text: b[e.b] });
  }

  // collapse into hunks around changed regions (3 lines of context)
  const hunks = toHunks(lines);
  return { hunks, moves, add, del };
}

/** Group the flat line list into hunks with a little context around changes. */
function toHunks(lines: SpanLine[], context = 3): SpanHunk[] {
  const changed = lines.map((l) => l.kind !== "context");
  const keep = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (changed[i]) for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  }
  const hunks: SpanHunk[] = [];
  let cur: SpanLine[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) { if (!cur) { cur = []; hunks.push({ header: hunkHeader(lines, i), lines: cur }); } cur.push(lines[i]); }
    else cur = null;
  }
  return hunks;
}

function hunkHeader(lines: SpanLine[], i: number): string {
  const no = lines[i].no ?? lines.find((l, k) => k >= i && l.no != null)?.no ?? 0;
  return `@@ around line ${no} @@`;
}

function lineFallback(a: string[], b: string[]): SpanDiff {
  const edit = lineLcs(a.slice(0, LINE_CAP), b.slice(0, LINE_CAP));
  const lines: SpanLine[] = [];
  let add = 0, del = 0, newNo = 0;
  for (const e of edit) {
    if (e.t === "equal") { newNo = e.b + 1; lines.push({ no: newNo, kind: "context", text: b[e.b] }); }
    else if (e.t === "del") { del++; lines.push({ no: null, kind: "del", text: a[e.a] }); }
    else { newNo = e.b + 1; add++; lines.push({ no: newNo, kind: "add", text: b[e.b] }); }
  }
  return { hunks: toHunks(lines), moves: [], add, del };
}
