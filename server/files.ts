import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./http.js";

const MAX_READ = 512 * 1024;
const SKIP = new Set([".git", "node_modules", ".next", ".turbo", "dist"]);

/** Jail all file access inside the session workspace. */
export function safeResolve(root: string, rel: string): string {
  const resolved = path.resolve(root, rel.replace(/^\/+/, ""));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new HttpError(400, "path escapes workspace");
  }
  return resolved;
}

export interface DirEntry {
  name: string;
  type: "dir" | "file";
}

export function listDir(root: string, rel: string): DirEntry[] {
  const dir = safeResolve(root, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new HttpError(404, `not a directory: ${rel}`);
  }
  return entries
    .filter((e) => !(rel === "" && SKIP.has(e.name)) && e.name !== ".git")
    .map((e): DirEntry => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }))
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
    );
}

export interface FileContent {
  path: string;
  content: string;
  binary: boolean;
  truncated: boolean;
}

export function readFile(root: string, rel: string): FileContent {
  const file = safeResolve(root, rel);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    throw new HttpError(404, `not a file: ${rel}`);
  }
  const slice = buf.subarray(0, MAX_READ);
  const binary = slice.includes(0);
  return {
    path: rel,
    content: binary ? "" : slice.toString("utf8"),
    binary,
    truncated: buf.length > MAX_READ,
  };
}

export function writeFile(root: string, rel: string, content: string): void {
  const file = safeResolve(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

export function writeFileRaw(root: string, rel: string, data: Buffer): void {
  const file = safeResolve(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

export function deletePath(root: string, rel: string): void {
  if (!rel.trim()) throw new HttpError(400, "refusing to delete workspace root");
  const target = safeResolve(root, rel);
  if (target === root) throw new HttpError(400, "refusing to delete workspace root");
  if (!fs.existsSync(target)) throw new HttpError(404, `no such path: ${rel}`);
  fs.rmSync(target, { recursive: true, force: true });
}

export function movePath(root: string, from: string, to: string): void {
  const src = safeResolve(root, from);
  const dst = safeResolve(root, to);
  if (!fs.existsSync(src)) throw new HttpError(404, `no such path: ${from}`);
  if (fs.existsSync(dst)) throw new HttpError(409, `already exists: ${to}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
}

export function makeDir(root: string, rel: string): void {
  fs.mkdirSync(safeResolve(root, rel), { recursive: true });
}

/** Flat list of file paths for @-mention fuzzy search. Bounded, jailed. */
export function listTree(root: string, cap = 4000): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    if (out.length >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (SKIP.has(e.name) || e.name === ".git") continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), childRel);
      else if (e.isFile()) out.push(childRel);
    }
  };
  walk(root, "");
  return out;
}

/** Sizes for pinned files so the client can estimate context tokens. */
export function statPaths(
  root: string,
  rels: string[],
): Array<{ path: string; bytes: number | null }> {
  return rels.slice(0, 100).map((rel) => {
    try {
      const stat = fs.statSync(safeResolve(root, rel));
      return { path: rel, bytes: stat.isFile() ? stat.size : null };
    } catch {
      return { path: rel, bytes: null };
    }
  });
}
