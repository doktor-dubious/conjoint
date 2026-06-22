import path from "node:path";
import process from "node:process";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// On this host, port 8000 is taken by another app; the conjoint API container
// is published on 8088 (see docker-compose.yml). Inside compose the web service
// overrides this via VITE_API_PROXY_TARGET=http://api:8000.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8088";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    // In Docker the bind mount may not deliver inotify events; poll instead.
    // Scoped via env so the host dev server keeps using native watching.
    watch:
      process.env.VITE_USE_POLLING === "true"
        ? { usePolling: true, interval: 300 }
        : undefined,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/healthz": { target: apiTarget, changeOrigin: true },
    },
  },
});
