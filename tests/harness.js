// Builds the app with Vite and loads it in headless Chromium with a pinned date and no network,
// then hands back the app's own engine functions so the tests call the real code.
//
// The test build (`vite build --mode golden`) adds src/golden-hooks.js, which exposes the engine
// on window.__RTN. The published build leaves that file out; otherwise the two are the same code.
//
// `--html some-copy.html` checks an old single-file copy of the app instead. Its main script is an
// IIFE, so the harness serves it with one extra line inserted before the IIFE closes that sets
// window.__RTN. The file itself is never changed.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ORIGIN = "http://run-the-numbers.test";
const TIMEZONE = "America/Toronto";

// The tax data used to live in the page as this script. Its SHA-256 is part of the snapshots, so the
// harness rebuilds the same text from the data the app runs with: matching hashes prove the figures
// are unchanged to the last digit.
const LEGACY_TAX_PREFIX = "// Generated from Airtable by airtable-sync/sync.py. Do not edit by hand.\nwindow.TAX_DATA=";
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

/* ---------- the Vite app ---------- */

async function buildApp() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtn-golden-"));
  const { build } = await import("vite");
  await build({ root: ROOT, mode: "golden", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  const files = {};
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f); else files["/" + path.relative(outDir, f).split(path.sep).join("/")] = fs.readFileSync(f);
  });
  walk(outDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  files["/"] = files["/index.html"];
  return {
    label: "the Vite build",
    files,
    taxDataSha256: async page => {
      const json = await page.evaluate(() => window.__RTN.taxDataJson);
      return sha256(LEGACY_TAX_PREFIX + json.replace(/"__INF__"/g, "Infinity") + ";");
    },
  };
}

/* ---------- an old single-file copy ---------- */

// Placed inside the IIFE, so it can see (and set) the app's private bindings.
const EXPOSE = `
window.__RTN={
  START_YEAR, F0, EXAMPLE:clone(EXAMPLE), PROV_CODES:Object.keys(PROV),
  simulate, findTargets, quickMC, mcRun:(d,N)=>mcRun(d,N,mcJob),
  personTax:(code,o)=>{PV=PROV[code]; return personTax(o);},
  houseTax:(code,base,w,s)=>{PV=PROV[code]; return houseTax(base,w,s);},
  payroll, cppAnnual, oasAnnual, survCppAnnual, rrifFactor, onHealth, bracketTax,
  validStore, migrate, clone
};
`;
const IIFE_END = "\n})();\n</script>";

function readSingleFile(file) {
  const html = fs.readFileSync(file, "utf8");
  const at = html.lastIndexOf(IIFE_END);
  if (at < 0) throw new Error("Could not find the end of the main script in " + file + ". Is this a single-file copy of the app?");
  const taxData = html.match(/<script id="taxData">([\s\S]*?)<\/script>/);
  if (!taxData) throw new Error('Could not find <script id="taxData"> in ' + file);
  const hash = sha256(taxData[1].trim());
  return {
    label: path.basename(file),
    files: { "/": Buffer.from(html.slice(0, at) + EXPOSE + html.slice(at)) },
    taxDataSha256: async () => hash,
  };
}

/* ---------- the browser ---------- */

// Replaces Date so `new Date()` and `Date.now()` return the pinned moment.
function pinDateScript(iso) {
  return `(() => {
    const PIN = ${JSON.stringify(Date.parse(iso))}, Real = Date;
    class PinnedDate extends Real {
      constructor(...a) { if (a.length === 0) super(PIN); else super(...a); }
      static now() { return PIN; }
    }
    globalThis.Date = PinnedDate;
  })();`;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

async function openApp({ browser, app, dateIso }) {
  const context = await browser.newContext({ timezoneId: TIMEZONE, locale: "en-CA", serviceWorkers: "block" });
  await context.addInitScript(pinDateScript(dateIso));
  // Serve the app from a fake origin (so localStorage works) and block every other request.
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    const body = url.origin === ORIGIN && app.files[url.pathname];
    if (body) route.fulfill({ status: 200, contentType: TYPES[path.extname(url.pathname) || ".html"] || "application/octet-stream", body });
    else route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(ORIGIN + "/");
  await page.waitForFunction(() => !!window.__RTN);
  if (errors.length) throw new Error("The page threw while loading: " + errors.join("; "));
  return { context, page, errors };
}

async function launch() {
  return chromium.launch();
}

module.exports = { TIMEZONE, buildApp, readSingleFile, openApp, launch };
