// Runs the Grotto server (tsx watch) and the Vite dev server together so
// `pnpm dev` from the app (or `turbo dev`) brings up the whole stack.
import { spawn } from "node:child_process";

const procs = [
  spawn("pnpm", ["dev:server"], { stdio: "inherit" }),
  spawn("pnpm", ["dev:web"], { stdio: "inherit" }),
];

function shutdown() {
  for (const p of procs) p.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const p of procs) p.on("exit", (code) => {
  if (code !== 0 && code !== null) shutdown();
});
