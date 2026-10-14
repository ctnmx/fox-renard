import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // The demo's HTTP API (`pnpm --filter @fox-renard/demo start`), which
    // the console calls on its own origin, as the Worker serves both.
    proxy: { "/v1": "http://localhost:8787" },
  },
});
