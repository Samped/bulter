import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/marketplace": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  resolve: {
    dedupe: ["viem"],
    alias: [
      {
        find: "@butler/core/marketplace",
        replacement: resolve(root, "packages/core/src/marketplace.ts"),
      },
      {
        find: "@butler/core/brief-intent",
        replacement: resolve(root, "packages/core/src/brief-intent.ts"),
      },
      {
        find: "@butler/arc",
        replacement: resolve(root, "packages/arc/src/chain.ts"),
      },
    ],
  },
  optimizeDeps: {
    include: ["viem", "@butler/arc"],
    exclude: ["@butler/core/brief-intent", "@butler/core/marketplace"],
  },
});
