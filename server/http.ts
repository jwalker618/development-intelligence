import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra machine-readable fields merged into the error body. */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

interface RouteOpts {
  /** Deliver the body as a raw Buffer (uploads) instead of parsed JSON. */
  raw?: boolean;
}

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
  raw: boolean;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, handler: Handler, opts?: RouteOpts): void {
    this.routes.push({
      method,
      parts: pattern.split("/").filter(Boolean),
      handler,
      raw: opts?.raw ?? false,
    });
  }

  private match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string>; raw: boolean } | null {
    const parts = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const p = route.parts[i];
        if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(parts[i]);
        else if (p !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params, raw: route.raw };
    }
    return null;
  }

  /** Returns true if a route handled the request. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://local");
    const found = this.match(req.method ?? "GET", url.pathname);
    if (!found) return false;
    try {
      const body = await readBody(req, found.raw);
      const result = await found.handler({
        req,
        res,
        params: found.params,
        query: url.searchParams,
        body,
      });
      if (!res.writableEnded) sendJson(res, 200, result ?? { ok: true });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      const extra = err instanceof HttpError ? err.extra : undefined;
      if (!res.writableEnded) sendJson(res, status, { error: message, ...extra });
    }
    return true;
  }
}

async function readBody(req: IncomingMessage, raw: boolean): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const limit = raw ? 32 * 1024 * 1024 : 5 * 1024 * 1024;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, "body too large");
    chunks.push(chunk as Buffer);
  }
  if (raw) return Buffer.concat(chunks);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

/** Static SPA serving: exact file if present, otherwise index.html fallback. */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://local");
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const resolved = path.resolve(root, rel);
  const target =
    resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
  const file = target && fs.existsSync(target) && fs.statSync(target).isFile()
    ? target
    : path.join(root, "index.html");
  if (!fs.existsSync(file)) {
    sendJson(res, 404, { error: "web build not found — run `pnpm build` first" });
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
    "cache-control": file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
  });
  fs.createReadStream(file).pipe(res);
}
