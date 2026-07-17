import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-mode proxy points at the Grotto server (scripts/dev.mjs starts both).
// In production the server serves dist/web itself, so no proxy is involved.
const SERVER = process.env.GROTTO_SERVER_URL ?? "http://localhost:4870";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/web", emptyOutDir: true },
  server: {
    port: 5178,
    proxy: {
      "/api": { target: SERVER, changeOrigin: true, ws: true },
    },
  },
});
