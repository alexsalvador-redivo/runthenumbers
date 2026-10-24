import { defineConfig } from "vite";

// Plain JavaScript, no framework. `npm run dev` serves the app; `npm run build` writes the static site to dist/.
export default defineConfig({
  build: { outDir: "dist" },
});
