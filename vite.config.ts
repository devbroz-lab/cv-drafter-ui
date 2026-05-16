import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.join(projectDir, "node_modules/react"),
      "react-dom": path.join(projectDir, "node_modules/react-dom"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
