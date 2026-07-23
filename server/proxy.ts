import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";

/**
 * Live-preview proxy: forwards browser traffic to a dev server the agent
 * started inside this container (`127.0.0.1:<port>` only — never remote).
 * HMR websockets go through proxyUpgrade, so hot reload works.
 */
export function proxyHttp(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  path: string,
): void {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port,
      path,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (ur) => {
      res.writeHead(ur.statusCode ?? 502, ur.headers);
      ur.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(
      `Nothing is listening on 127.0.0.1:${port} — start a dev server in the Agent tab first.`,
    );
  });
  req.pipe(upstream);
}

/** Raw TCP relay for WebSocket upgrades (dev-server HMR). */
export function proxyUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  port: number,
  path: string,
): void {
  const upstream = net.connect(port, "127.0.0.1", () => {
    const lines = [`${req.method} ${path} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const key = req.rawHeaders[i];
      const value =
        key.toLowerCase() === "host" ? `127.0.0.1:${port}` : req.rawHeaders[i + 1];
      lines.push(`${key}: ${value}`);
    }
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}
