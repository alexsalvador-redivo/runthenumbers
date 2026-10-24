// Draws public/og-image.png, the 1200 × 630 picture LinkedIn, Substack and others show when the
// app's link is shared. It builds the app, opens the example plan in headless Chromium, takes a
// picture of the results (verdict, headline numbers and chart), and lays it out beside the app's name.
//
//   npm run og-image
//
// Run it again after a visible change to the results column. Nothing here is part of the app.
import { build } from "vite";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "public", "og-image.png");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const dist = mkdtempSync(join(tmpdir(), "rtn-og-"));
await build({ root: ROOT, logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
const server = createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, colorScheme: "light", serviceWorkers: "block" });
  await page.goto(url);
  await page.click("#qSkip");
  await page.waitForFunction(() => document.getElementById("vBig").textContent.trim() !== "…");
  await page.evaluate(() => document.fonts.ready);

  // The results column without the takeaways, cut off below the chart
  await page.addStyleTag({ content: "#takeaways,#reportMsg{display:none!important}" });
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const top = document.getElementById("verdict").getBoundingClientRect();
    const chart = document.getElementById("chartBox").closest(".panel").getBoundingClientRect();
    return { x: top.left - 1, y: top.top - 1, width: top.width + 2, height: chart.bottom - top.top + 2 };
  });
  const shot = (await page.screenshot({ clip: box })).toString("base64");

  // The card, drawn with the app's own fonts and colours
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.evaluate(({ shot, w, h }) => {
    document.body.innerHTML = `
      <div class="og">
        <div class="og-text">
          <img class="og-icon" src="/icons/icon-192.png" alt="">
          <h1>Run The Numbers</h1>
          <p class="og-q">Will your retirement savings last?</p>
          <p class="og-d">A free retirement calculator for Canadians. CPP, OAS, RRSP, TFSA and tax in every province, year by year in today's dollars.</p>
          <p class="og-p">Your numbers stay on your device.</p>
        </div>
        <div class="og-shot"><img src="data:image/png;base64,${shot}" width="${w}" height="${h}" alt=""></div>
      </div>`;
    const css = document.createElement("style");
    css.textContent = `
      html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:var(--bg)}
      .og{display:grid;grid-template-columns:470px 1fr;height:630px}
      .og-text{display:flex;flex-direction:column;justify-content:center;padding:0 24px 0 64px;gap:0}
      .og-icon{width:72px;height:72px;border-radius:18px;margin-bottom:26px}
      .og h1{font-size:56px;line-height:1;margin:0 0 18px}
      .og-q{font-family:var(--f-display);font-weight:700;font-size:30px;line-height:1.15;color:var(--accent);margin:0 0 18px;letter-spacing:-.01em}
      .og-d{font-size:20px;line-height:1.4;color:var(--muted);margin:0 0 22px}
      .og-p{font-size:17px;font-weight:600;color:var(--fg);margin:0;padding:8px 14px;border-radius:10px;background:var(--accent-soft);align-self:flex-start}
      .og-shot{position:relative;overflow:hidden}
      .og-shot img{position:absolute;left:24px;top:56px;width:${Math.round(w * 0.82)}px;height:auto;border-radius:14px;box-shadow:0 18px 50px rgba(22,32,29,.18),0 2px 6px rgba(22,32,29,.08)}`;
    document.head.appendChild(css);
  }, { shot, w: box.width, h: box.height });
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await page.screenshot({ path: OUT, scale: "css" });
  console.log(`Wrote ${OUT.replace(ROOT, "")} (1200 × 630).`);
} finally {
  await browser.close();
  server.close();
  rmSync(dist, { recursive: true, force: true });
}
