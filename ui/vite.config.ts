// Demo-only UI build. Runs entirely in the browser on core/ and data/: no server, no executor.
// JSX is compiled by Vite's built-in esbuild (no React plugin needed for the demo).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
