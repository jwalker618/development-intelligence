/* Development Intelligence — client session state (design handoff §7).
 * The clients are viewports; this is the shape the control plane feeds. Seeded
 * here with the reference data from the design so the UI is exercised before
 * the live wiring lands. Every field maps to a screen surface. */

export type View = "session" | "changes" | "files" | "preview" | "tasks";
export type Theme = "indigo" | "teal" | "ember" | "plum" | "graphite";

export type CavemanMode = "off" | "lite" | "full" | "ultra";
export type Verdict = "keep" | "revert" | "tighten" | null;

export interface DiffOp {
  kind: "equal" | "insert" | "delete" | "replace" | "move";
  /** rendered tokens; for replace, old+new; for move, the summary */
  text?: string;
  oldText?: string;
  newText?: string;
  movedLines?: number;
  movedTo?: string;
}

export interface Hunk {
  header: string;          // @@ -12,7 +12,9 @@ ReviewQueue()
  lines: DiffLine[];
  verdict: Verdict;
}

export interface DiffLine {
  no: number | null;
  kind: "context" | "add" | "del" | "replace" | "hunk";
  text?: string;
  ops?: DiffOp[];          // for a replace line rendered inline
}

export interface Change {
  path: string;
  status: "M" | "A" | "D";
  needsYou: boolean;
  reviewed: boolean;
  add: number;
  del: number;
  moved?: boolean;
  kind?: "approval" | "file";
  hunks?: Hunk[];
}

export interface TimelineTick {
  at: string;
  label: string;
  kind: "now" | "pinned" | "approved" | "merged";
}

export interface Pin {
  id: string;
  icon: string;            // lucide name
  label: string;
}

export type ParamType = "int" | "bool" | "string" | "enum";

export interface TaskParam {
  key: string;
  label: string;
  type: ParamType;
  value: number | boolean | string;
  hint?: string;
  options?: string[];
}

export interface TaskManifest {
  id: string;
  group: string;           // Backend / Tests
  name: string;
  sub: string;
  icon: string;            // lucide name
  destructive: boolean;
  confirm?: { challenge: string; expect: string };
  setupStatus: string;     // "railway authed · container ready"
  description: string;
  params: TaskParam[];
  secretRefs: string[];
  /** template lines with ${param}/${secret} markers for the "will run" preview */
  runTemplate: string;
}

export interface RouteInfo { path: string; label: string; active?: boolean; note?: string; }
export interface RuntimeMsg { level: "error" | "warn"; text: string; at: string; }

export interface SessionState {
  repoCount: number;
  branch: string; ahead: number; behind: number;
  caveman: { mode: CavemanMode; savedPct: number };
  rtk: { gainPct: number };
  timeline: TimelineTick[];
  pins: Pin[];
  changes: Change[];
  tasks: TaskManifest[];
  preview: { host: string; route: string; viewport: "phone" | "tablet" | "desktop"; routes: RouteInfo[]; runtime: RuntimeMsg[]; builtAgo: string };
}

// ── the reference session (from the design pixels) ──────────────────────────

export const seedState: SessionState = {
  repoCount: 3,
  branch: "feat/review-v2", ahead: 2, behind: 0,
  caveman: { mode: "ultra", savedPct: 3 },
  rtk: { gainPct: 19 },
  timeline: [
    { at: "14:02", label: "now — reviewing", kind: "now" },
    { at: "13:58", label: "★ pinned — diff decision", kind: "pinned" },
    { at: "13:40", label: "approved pnpm build", kind: "approved" },
    { at: "13:10", label: "merged v1 · 3 files", kind: "merged" },
  ],
  pins: [
    { id: "p1", icon: "git-compare", label: "Span-level diff + LCS moves" },
    { id: "p2", icon: "terminal", label: "Test cmd: pnpm test" },
  ],
  changes: [
    {
      path: "approve: pnpm test", status: "M", needsYou: true, reviewed: false,
      add: 0, del: 0, kind: "approval",
    },
    { path: "server/review.ts", status: "M", needsYou: true, reviewed: false, add: 0, del: 0, kind: "file" },
    {
      path: "ReviewQueue.tsx", status: "M", needsYou: false, reviewed: false, add: 48, del: 12, moved: true, kind: "file",
      hunks: [
        {
          header: "@@ -12,7 +12,9 @@ ReviewQueue()",
          verdict: null,
          lines: [
            { no: 13, kind: "context", text: "  const pending = changes.filter(c => c.needsYou);" },
            {
              no: 14, kind: "replace",
              ops: [
                { kind: "equal", text: "  const rows = " },
                { kind: "delete", oldText: "changes" },
                { kind: "insert", newText: "pending" },
                { kind: "equal", text: ".map(renderRow);" },
              ],
            },
            { no: 15, kind: "add", text: "+ const reviewed = changes.filter(c => c.reviewed);" },
          ],
        },
      ],
    },
    { path: "ReviewRow.tsx", status: "A", needsYou: false, reviewed: false, add: 96, del: 0, kind: "file" },
  ],
  tasks: [
    {
      id: "seed-dsi", group: "Backend", name: "Seed DSI backend", sub: "reset + reseed synthetic data",
      icon: "database", destructive: true,
      confirm: { challenge: "Type the service name to confirm", expect: "dsi-api" },
      setupStatus: "railway authed · container ready",
      description: "Reset and reseed the DSI Postgres with in-network synthetic data.",
      params: [
        { key: "per_config", label: "per_config", type: "int", value: 25, hint: "synthetic configs per client" },
        { key: "clients_per_tier", label: "clients_per_tier", type: "int", value: 300, hint: "clients seeded per tier" },
        { key: "reset", label: "reset", type: "bool", value: true, hint: "drop & recreate before seeding" },
      ],
      secretRefs: ["DSI_DATABASE_URL"],
      runTemplate:
        "railway ssh sh -c 'cd /app && export \\\n" +
        "  DATABASE_URL_SYNC=${secret:DSI_DATABASE_URL} DSI_REBUILD_RESET=${param:reset} \\\n" +
        "  DSI_PER_CONFIG=${param:per_config} DSI_CLIENTS_PER_TIER=${param:clients_per_tier} && \\\n" +
        "  python -m seed'",
    },
    {
      id: "deploy-preview", group: "Backend", name: "Deploy preview", sub: "push branch to preview env",
      icon: "rocket", destructive: false, setupStatus: "railway authed · container ready",
      description: "Build the current branch and push it to the preview environment.",
      params: [], secretRefs: [], runTemplate: "railway up --environment preview",
    },
    {
      id: "run-migrations", group: "Backend", name: "Run migrations", sub: "apply pending Prisma migrations",
      icon: "database-zap", destructive: true,
      confirm: { challenge: "Type the database name to confirm", expect: "railway" },
      setupStatus: "railway authed · container ready",
      description: "Apply all pending Prisma migrations to the linked database.",
      params: [], secretRefs: ["DSI_DATABASE_URL"],
      runTemplate: "railway ssh sh -c 'cd /app && npx prisma migrate deploy'",
    },
    {
      id: "pnpm-test", group: "Tests", name: "pnpm test", sub: "unit + component suite",
      icon: "flask-conical", destructive: false, setupStatus: "container ready",
      description: "Run the unit and component test suite.",
      params: [], secretRefs: [], runTemplate: "pnpm test",
    },
    {
      id: "e2e-smoke", group: "Tests", name: "e2e smoke", sub: "Playwright happy-path",
      icon: "scan-eye", destructive: false, setupStatus: "container ready",
      description: "Run the Playwright happy-path smoke suite.",
      params: [], secretRefs: [], runTemplate: "pnpm playwright test --grep @smoke",
    },
  ],
  preview: {
    host: "localhost:5173", route: "/review", viewport: "phone", builtAgo: "0.8s",
    routes: [
      { path: "/", label: "home" },
      { path: "/review", label: "2 need you", active: true },
      { path: "/sessions", label: "" },
      { path: "/login", label: "" },
    ],
    runtime: [
      { level: "error", text: "TypeError: cannot read 'map' of undefined", at: "ReviewQueue.tsx:14" },
    ],
  },
};

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: "indigo", label: "Indigo", swatch: "linear-gradient(135deg,#4a60a8,#39d3ba)" },
  { id: "teal", label: "Teal", swatch: "linear-gradient(135deg,#0e7c8c,#39d3ba)" },
  { id: "ember", label: "Ember", swatch: "linear-gradient(135deg,#f0926e,#f8bd5e)" },
  { id: "plum", label: "Plum", swatch: "linear-gradient(135deg,#8a5cc4,#b98fe0)" },
  { id: "graphite", label: "Graphite", swatch: "linear-gradient(135deg,#5a6b7c,#f0926e)" },
];

export const VIEWS: { id: View; label: string; icon: string; sub: string }[] = [
  { id: "session", label: "Session", icon: "messages-square", sub: "the agent conversation" },
  { id: "changes", label: "Changes", icon: "git-compare", sub: "review what landed" },
  { id: "files", label: "Files", icon: "folder-tree", sub: "tree · pin to context" },
  { id: "preview", label: "Preview", icon: "monitor-smartphone", sub: "the running app" },
  { id: "tasks", label: "Tasks", icon: "square-terminal", sub: "runbooks as tasks" },
];
