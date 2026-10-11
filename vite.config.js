import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /data and /api go to the deployed Worker so the app runs against real data.
const target = process.env.EDGE_URL || "https://campus-playbook.shneur.workers.dev";
// DATA_URL points /data at a local folder server instead, to try engine output before it is published.
const data = process.env.DATA_URL || target;
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/data": { target: data, changeOrigin: true }, "/api": { target, changeOrigin: true } } },
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
});
