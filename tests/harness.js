// Loads run-the-numbers.html in headless Chromium with a pinned date and no network,
// and hands back the app's own engine functions so the tests call the real code.
//
// The main script is wrapped in an IIFE, so its functions are not global. The harness
// serves a copy of the page with one extra line inserted just before the IIFE closes,
// which exposes them on window.__RTN. The app file itself is never changed.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");

const APP = path.join(__dirname, "..", "run-the-numbers.html");
const ORIGIN = "http://run-the-numbers.test";
const TIMEZONE = "America/Toronto";

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

function readApp(file = APP) {
  const html = fs.readFileSync(file, "utf8");
  const at = html.lastIndexOf(IIFE_END);
  if (at < 0) throw new Error("Could not find the end of the main script in " + file + ". If the code was moved into modules, update tests/harness.js to expose the engine from there.");
  const taxData = html.match(/<script id="taxData">([\s\S]*?)<\/script>/);
  if (!taxData) throw new Error('Could not find <script id="taxData"> in ' + file);
  return {
    html: html.slice(0, at) + EXPOSE + html.slice(at),
    taxDataSha256: crypto.createHash("sha256").update(taxData[1].trim()).digest("hex"),
  };
}

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

async function openApp({ browser, html, dateIso }) {
  const context = await browser.newContext({ timezoneId: TIMEZONE, locale: "en-CA" });
  await context.addInitScript(pinDateScript(dateIso));
  // Serve the page from a fake origin (so localStorage works) and block every other request.
  await context.route("**/*", route => {
    if (route.request().url().startsWith(ORIGIN)) route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
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

module.exports = { APP, TIMEZONE, readApp, openApp, launch };
