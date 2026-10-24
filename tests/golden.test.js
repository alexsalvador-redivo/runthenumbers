#!/usr/bin/env node
// Golden-output tests for the tax engine and the projection.
//
//   npm test                  compare today's app to the saved snapshots in tests/golden/
//   npm run golden:update     re-record the snapshots (only after Alex OKs a change in results)
//   node tests/golden.test.js --html other.html   check a different copy of the app
//
// Every number is compared exactly, to the last digit.
const fs = require("fs");
const path = require("path");
const { readApp, openApp, launch, APP, TIMEZONE } = require("./harness");
const C = require("./cases");

const GOLDEN = path.join(__dirname, "golden");
const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const htmlArg = args.indexOf("--html");
const APP_FILE = htmlArg >= 0 ? path.resolve(args[htmlArg + 1]) : APP;

// JSON can't hold Infinity, NaN or -0, so spell them out.
const normalize = x => JSON.parse(JSON.stringify(x, (k, v) =>
  typeof v === "number" ? (Number.isFinite(v) ? (Object.is(v, -0) ? "-0" : v) : String(v)) : v));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n"); };

/* ---------- what runs inside the page ---------- */

// Direct checks of the tax and benefit functions. Date-independent.
function engineInPage() {
  const R = window.__RTN, out = {};
  const z = (o) => ({ salary: 0, other: 0, pension: 0, cpp: 0, oas: 0, rrspW: 0, splitOut: 0, splitIn: 0, rrspDed: 0, elig: 0, age: 45, single: true, ...o, pay: R.payroll(o.salary || 0) });
  const incomes = [0, 12000, 18000, 25000, 35000, 45000, 58000, 75000, 95000, 120000, 150000, 185000, 230000, 300000, 500000];
  out.personTax = {};
  for (const code of R.PROV_CODES) {
    const g = out.personTax[code] = {};
    g.salaryAge45 = incomes.map(x => R.personTax(code, z({ salary: x, rrspDed: Math.min(x * 0.1, 15000) })));
    g.pensionAge70 = incomes.map(x => R.personTax(code, z({ age: 70, pension: x * 0.5, elig: x * 0.5, cpp: Math.min(x * 0.2, 17000), oas: 8700, rrspW: x * 0.3 })));
    g.rrifAge80Couple = incomes.map(x => R.personTax(code, z({ age: 80, single: false, rrspW: x, elig: x, cpp: 12000, oas: 9600 })));
    g.partTimeAge62 = incomes.map(x => R.personTax(code, z({ age: 62, salary: x * 0.4, other: x * 0.1, pension: x * 0.5, elig: x * 0.5 })));
    // Couples, with and without pension splitting, both under and over 65
    const pair = (a0, inc0, a1, inc1) => [
      { age: a0, salary: 0, other: 0, pay: R.payroll(0), rrspDed: 0, pension: inc0 * 0.6, cpp: 14000, oas: a0 >= 65 ? 8700 : 0 },
      { age: a1, salary: 0, other: 0, pay: R.payroll(0), rrspDed: 0, pension: inc1 * 0.6, cpp: 6000, oas: a1 >= 65 ? 8700 : 0 }];
    g.houseTax = [[66, 120000, 64, 10000], [70, 90000, 71, 30000], [62, 150000, 60, 0], [75, 200000, 75, 40000], [68, 60000, 68, 60000]]
      .flatMap(([a0, i0, a1, i1]) => [true, false].map(on => R.houseTax(code, pair(a0, i0, a1, i1), [i0 * 0.4, i1 * 0.4], on)));
  }
  out.payroll = incomes.map(R.payroll);
  out.cppAnnual = [];
  for (const cpp65 of [0, 650, 1150, 1433]) for (let s = 58; s <= 72; s++) out.cppAnnual.push(R.cppAnnual({ cpp65, cppStart: s }));
  out.oasAnnual = [];
  for (const yrs of [0, 9, 10, 22, 39, 40, 45]) for (let s = 64; s <= 71; s++) for (const age of [65, 70, 74, 75, 90]) out.oasAnnual.push(R.oasAnnual({ oasYears: yrs, oasStart: s }, age));
  out.survCppAnnual = [];
  for (const own of [0, 6000, 12000, 18000]) for (const dec of [0, 700, 1150, 1433]) for (const age of [45, 60, 64, 65, 80]) out.survCppAnnual.push(R.survCppAnnual(own, { cpp65: dec }, age));
  out.rrifFactor = Array.from({ length: 50 }, (_, i) => R.rrifFactor(60 + i));
  out.onHealth = [0, 19999, 20000, 25000, 36000, 40000, 48000, 50000, 72000, 72600, 100000, 200000, 200600, 500000].map(R.onHealth);
  return out;
}

// Everything that depends on the plan and today's date.
async function plansInPage(cases) {
  const R = window.__RTN, out = { meta: { START_YEAR: R.START_YEAR, F0: R.F0 }, plans: {} };
  for (const [name, d0] of Object.entries(cases.PLANS)) {
    let d = d0;
    if (!d) { d = R.clone(R.EXAMPLE); const pt = cases.EXAMPLE_PATCHES[name] || {}; Object.assign(d.house, pt.house || {}); Object.assign(d.assume, pt.assume || {}); }
    const res = { simulate: R.simulate(R.clone(d)) };
    res.quickMC = R.quickMC(R.clone(d), cases.QUICK_MC_N);
    if (cases.FIND_TARGETS.includes(name)) res.findTargets = R.findTargets(R.clone(d));
    if (cases.MONTE_CARLO.plans.includes(name)) {
      const runs = await R.mcRun(R.clone(d), cases.MONTE_CARLO.N);
      const years = runs[0].totals.length, pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
      res.monteCarlo = {
        N: runs.length, okShare: runs.filter(x => x.short === null).length / runs.length,
        short: runs.map(x => x.short), estate: runs.map(x => x.estate),
        totals: { p10: [], p50: [], p90: [] },
      };
      for (let k = 0; k < years; k++) { const col = runs.map(x => x.totals[k] || 0); for (const [key, p] of [["p10", .1], ["p50", .5], ["p90", .9]]) res.monteCarlo.totals[key].push(pct(col, p)); }
    }
    out.plans[name] = res;
  }
  // Old backups must keep restoring and give the same projection
  const old = R.clone(cases.OLD_STORE);
  out.migrate = { valid: R.validStore(old) };
  R.migrate(old);
  out.migrate.store = old;
  out.migrate.simulate = R.simulate(R.clone(old.scenarios[0].data));
  return out;
}

// Marginal rate = tax on $1 more of ordinary income (not salary, so CPP/EI credits don't blur it).
function marginalInPage(checks) {
  const R = window.__RTN;
  const tax = (c, x) => R.personTax(c.province, { salary: 0, other: x, pension: 0, cpp: 0, oas: 0, rrspW: 0, splitOut: 0, splitIn: 0, rrspDed: 0, elig: 0, age: c.age, single: true, pay: R.payroll(0) }).tax;
  return checks.map(c => ({ ...c, got: Math.round((tax(c, c.income + 1) - tax(c, c.income)) * 10000) / 100 }));
}

/* ---------- compare ---------- */

function diff(a, b, at, out, max = 25) {
  if (out.length >= max) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(at + ": expected " + JSON.stringify(a) + ", got " + JSON.stringify(b)); return out; }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in b)) out.push(at + "." + k + ": missing in new results");
      else if (!(k in a)) out.push(at + "." + k + ": new field " + JSON.stringify(b[k]).slice(0, 80));
      else diff(a[k], b[k], at + (Array.isArray(a) ? "[" + k + "]" : "." + k), out, max);
      if (out.length >= max) break;
    }
  } else if (a !== b) {
    out.push(at + ": expected " + JSON.stringify(a) + ", got " + JSON.stringify(b) + (typeof a === "number" ? " (moved by " + (b - a) + ")" : ""));
  }
  return out;
}

/* ---------- human-readable summary ---------- */

const $ = v => (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-CA");
function summary(meta, byDate) {
  let s = "# Golden snapshot summary\n\nGenerated by `npm run golden:update`. Do not edit by hand. Amounts are in today's dollars, rounded here for reading; the JSON files hold every digit.\n\n";
  s += "- Tax data SHA-256: `" + meta.taxDataSha256 + "`\n- Time zone: " + TIMEZONE + "\n\n";
  for (const [date, r] of Object.entries(byDate)) {
    s += "## Today pinned to " + date + "\n\nProjection starts in " + r.meta.START_YEAR + (r.meta.F0 < 1 ? " with " + (r.meta.F0 * 100).toFixed(1) + "% of the year left" : " (full first year)") + ".\n\n";
    s += "| Plan | Province | Lifetime tax | OAS clawback | Money runs short | Estate after tax | Market histories OK |\n|---|---|--:|--:|---|--:|--:|\n";
    for (const [name, p] of Object.entries(r.plans)) {
      const sim = p.simulate, short = sim.firstShort === null ? "Never" : String(sim.rows[sim.firstShort].year);
      const prov = (C.PLANS[name] || { house: { province: "BC" } }).house.province;
      s += "| " + name + " | " + prov + " | " + $(sim.lifeTax) + " | " + $(sim.lifeClaw) + " | " + short + " | " + $(sim.estate) + " | " + p.quickMC + "%" + (p.monteCarlo ? " (" + Math.round(p.monteCarlo.okShare * 100) + "% of " + p.monteCarlo.N + ")" : "") + " |\n";
    }
    s += "\n";
  }
  return s;
}

/* ---------- main ---------- */

(async () => {
  const t0 = Date.now();
  const { html, taxDataSha256 } = readApp(APP_FILE);
  const browser = await launch();
  const actual = {}, byDate = {};
  let marginal = [];
  try {
    for (const [date, iso] of Object.entries(C.DATES)) {
      const { context, page, errors } = await openApp({ browser, html, dateIso: iso });
      if (!actual["engine.json"]) {
        actual["engine.json"] = normalize({ taxDataSha256, ...(await page.evaluate(engineInPage)) });
        marginal = await page.evaluate(marginalInPage, C.MARGINAL);
      }
      const r = normalize(await page.evaluate(plansInPage, C));
      if (errors.length) throw new Error("The page threw while running: " + errors.join("; "));
      byDate[date] = r;
      actual[date + "/meta.json"] = r.meta;
      actual[date + "/migrate.json"] = r.migrate;
      for (const [name, p] of Object.entries(r.plans)) actual[date + "/" + name + ".json"] = p;
      await context.close();
    }
  } finally { await browser.close(); }

  // Fixed expectations, checked every run (also before re-recording)
  const badRates = marginal.filter(m => m.got !== m.rate);
  marginal.forEach(m => console.log((m.got === m.rate ? "✓" : "✗") + " " + m.province + " marginal rate at " + $(m.income) + ": expected " + m.rate + "%, got " + m.got + "%"));
  if (badRates.length) { console.error("✗ " + badRates.length + " marginal-rate spot check(s) failed."); process.exitCode = 1; if (UPDATE) { console.error("Not re-recording while spot checks fail."); return; } }

  if (UPDATE) {
    fs.rmSync(GOLDEN, { recursive: true, force: true });
    for (const [rel, data] of Object.entries(actual)) write(path.join(GOLDEN, rel), data);
    fs.writeFileSync(path.join(GOLDEN, "SUMMARY.md"), summary({ taxDataSha256 }, byDate));
    console.log("Recorded " + Object.keys(actual).length + " snapshots in tests/golden/ (" + ((Date.now() - t0) / 1000).toFixed(1) + "s).");
    return;
  }

  const failures = [];
  const listed = new Set();
  for (const [rel, data] of Object.entries(actual)) {
    listed.add(rel);
    const file = path.join(GOLDEN, rel);
    if (!fs.existsSync(file)) { failures.push([rel, ["no saved snapshot. Run npm run golden:update if this case is new."]]); continue; }
    const d = diff(JSON.parse(fs.readFileSync(file, "utf8")), data, rel.replace(/\.json$/, ""), []);
    if (d.length) failures.push([rel, d]);
  }
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  if (fs.existsSync(GOLDEN)) for (const f of walk(GOLDEN)) { const rel = path.relative(GOLDEN, f).split(path.sep).join("/"); if (rel.endsWith(".json") && !listed.has(rel)) failures.push([rel, ["saved snapshot has no matching case any more"]]); }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!failures.length) { if (!badRates.length) console.log("✓ All " + listed.size + " golden snapshots match exactly (" + secs + "s)."); return; }
  console.error("✗ " + failures.length + " of " + listed.size + " snapshots changed (" + secs + "s):\n");
  for (const [rel, d] of failures) { console.error("  " + rel); d.forEach(x => console.error("    " + x)); }
  console.error("\nIf this change was meant to move results, get Alex's OK, then run: npm run golden:update");
  process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
