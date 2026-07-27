import {
  AlertOctagon, AlertTriangle, ArrowUp, ArrowUpLeft, Asterisk, AtSign, BatteryFull, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, CornerUpLeft, Database, DatabaseZap, ExternalLink, Eye, EyeOff,
  FileCode2, FilePen, FilePenLine, FilePlus2, FlaskConical, Folder, FolderGit2, FolderPlus,
  FolderTree, GitBranch, GitCommitHorizontal, GitCompare, Globe, Loader, Lock, MessagesSquare,
  Monitor, MonitorSmartphone, Move, Pin, Play, Plus, Radio, RefreshCw, Rocket, RotateCw, ScanEye,
  Search, Settings, ShieldAlert, Signal, Smartphone, SquareArrowOutDownRight, SquareTerminal, Tablet,
  Terminal, Upload, Wifi, X,
  Sparkles, Download, Save, MousePointerClick, MonitorOff, CheckCheck, FileImage, Image, File, FolderOpen,
  Pause, Square, Flame, MinusCircle, User, Shield, ShieldOff, Info, Copy, Link,
  Hand, ShieldX, ListChecks, FastForward, ShieldCheck, Beaker, ChevronLeft, MoreHorizontal, Trash2, Layers, CornerDownRight, ChevronUp, UploadCloud, Undo2, List, History, Ban, FoldVertical, Bookmark, Stethoscope, AlertCircle, TextCursorInput, Repeat, CircleDollarSign, CloudOff, type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/** Kebab-case (design vocabulary) → Lucide component. Only the icons the
 *  screens use are imported, so they render synchronously and tree-shake. */
const ICONS: Record<string, LucideIcon> = {
  "alert-octagon": AlertOctagon, "alert-triangle": AlertTriangle, "arrow-up": ArrowUp,
  "arrow-up-left": ArrowUpLeft, eye: Eye, "eye-off": EyeOff, settings: Settings,
  asterisk: Asterisk, "at-sign": AtSign, "battery-full": BatteryFull, check: Check,
  "check-circle-2": CheckCircle2, "chevron-down": ChevronDown, "chevron-right": ChevronRight,
  circle: Circle, "corner-up-left": CornerUpLeft, database: Database, "database-zap": DatabaseZap,
  "external-link": ExternalLink, "file-code-2": FileCode2, "file-pen": FilePen,
  "file-pen-line": FilePenLine, "file-plus-2": FilePlus2, "flask-conical": FlaskConical,
  folder: Folder, "folder-git-2": FolderGit2, "folder-plus": FolderPlus, "folder-tree": FolderTree,
  "git-branch": GitBranch, "git-commit-horizontal": GitCommitHorizontal, "git-compare": GitCompare,
  globe: Globe, loader: Loader, lock: Lock, "messages-square": MessagesSquare, monitor: Monitor,
  "monitor-smartphone": MonitorSmartphone, move: Move, pin: Pin, play: Play, plus: Plus,
  radio: Radio, "refresh-cw": RefreshCw, rocket: Rocket, "rotate-cw": RotateCw, "scan-eye": ScanEye,
  search: Search, "shield-alert": ShieldAlert, signal: Signal, smartphone: Smartphone,
  "square-arrow-out-down-right": SquareArrowOutDownRight, "square-terminal": SquareTerminal,
  tablet: Tablet, terminal: Terminal, upload: Upload, wifi: Wifi, x: X,
  sparkles: Sparkles, download: Download, save: Save, "mouse-pointer-click": MousePointerClick,
  "monitor-off": MonitorOff, "check-check": CheckCheck, "file-image": FileImage, image: Image,
  file: File, "folder-open": FolderOpen, pause: Pause, square: Square, flame: Flame, "minus-circle": MinusCircle,
  user: User, shield: Shield, copy: Copy, link: Link,
  "shield-off": ShieldOff, info: Info,
  // Added for the turns 43–49 design pass.
  "hand": Hand, "shield-x": ShieldX, "list-checks": ListChecks, "fast-forward": FastForward, "shield-check": ShieldCheck, "beaker": Beaker, "chevron-left": ChevronLeft, "more-horizontal": MoreHorizontal, "trash-2": Trash2, "layers": Layers, "corner-down-right": CornerDownRight, "chevron-up": ChevronUp, "upload-cloud": UploadCloud, "undo-2": Undo2, "list": List, "history": History, "ban": Ban, "fold-vertical": FoldVertical, "bookmark": Bookmark, "stethoscope": Stethoscope, "alert-circle": AlertCircle, "text-cursor-input": TextCursorInput, "repeat": Repeat, "circle-dollar-sign": CircleDollarSign, "cloud-off": CloudOff,
};

/** Lucide icon by kebab-case name (the design references names verbatim). */
export function Icon({
  name, size = 14, color = "currentColor", style,
}: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} color={color} style={{ flex: "0 0 auto", ...style }} aria-hidden />;
}

/** Uppercase tracked eyebrow. `tone` overrides the default ink-mute. */
export function Eyebrow({ children, tone, style }: { children: ReactNode; tone?: string; style?: CSSProperties }) {
  return <div className="di-eyebrow" style={{ color: tone, ...style }}>{children}</div>;
}

/** A rail section title using the theme's rail-title hue. */
export function RailTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="di-eyebrow" style={{ color: "var(--di-rail-title)", ...style }}>{children}</div>;
}
