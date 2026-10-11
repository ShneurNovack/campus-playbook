import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /data and /api go to the deployed Worker so the app runs against real data.
const target = process.env.EDGE_URL || "https://campus-playbook.shneur.workers.dev";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/data": { target, changeOrigin: true }, "/api": { target, changeOrigin: true } } },
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
});
