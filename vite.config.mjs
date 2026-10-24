import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

// The public address and the footer's "Built by" line. Change them in site.config.json.
const site = JSON.parse(readFileSync(new URL("./site.config.json", import.meta.url), "utf8"));
const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fills %SITE_URL%, %BUILT_BY% and %BUILT_BY_URL% in index.html. Link previews need full addresses.
const siteInfo = () => ({
  name: "site-info",
  transformIndexHtml: html => html
    .replace(/%SITE_URL%/g, esc(site.url.replace(/\/+$/, "")))
    .replace(/%BUILT_BY_URL%/g, esc(site.builtByUrl))
    .replace(/%BUILT_BY%/g, esc(site.builtBy)),
});

// Plain JavaScript, no framework. `npm run dev` serves the app; `npm run build` writes the static site to dist/.
export default defineConfig({
  build: { outDir: "dist" },
  plugins: [
    siteInfo(),
    // Installable app with offline support. The service worker caches the whole app on the first visit,
    // and when a new version is published it downloads it in the background and uses it from the next launch.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Run The Numbers",
        short_name: "Run The Numbers",
        description: "Retirement projection for Canadians, on your own or as a couple, in today's dollars. Your numbers stay on your device.",
        lang: "en-CA",
        start_url: "./",
        scope: "./",
        display: "standalone",
        theme_color: "#1c6a54",
        background_color: "#f3f6f5",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,woff2,png,svg,webmanifest}"],
        // Optional jsPDF helpers for HTML-to-PDF, which the report never uses; the link-preview image is only for LinkedIn and others
        globIgnores: ["**/html2canvas-*.js", "**/purify.es-*.js", "**/index.es-*.js", "og-image.png"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
