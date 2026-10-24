// Rebuilds src/data/tax-data.json from the Airtable base that holds the tax and benefit figures.
//
//   npm run sync               fetch, check, show what changed, and write the file
//   npm run sync -- --dry-run  fetch, check and show what changed, without writing
//
// Reads AIRTABLE_TOKEN from the environment or from a .env file in the project folder (.env is
// ignored by git, so the token is never committed or published). A read-only token with the
// data.records:read scope on this base is enough.
//
// This runs on your computer only. The figures are written into the app's source and built into
// the site, so a visitor's browser never contacts Airtable.
//
// Nothing is written if a check fails, or if the figures are the same as last time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/tax-data.json");
const BASE_ID = "app2siuG6WVXJu2G6";
const TABLES = { jur: "Jurisdictions", br: "Brackets", ben: "Benefits & limits", rrif: "RRIF minimums" };

// The order the app has always listed the provinces and territories in
const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];
// Every "Benefits & limits" key the app reads
const BENEFIT_KEYS = ["yampe", "oasThreshold", "ympe", "survCombined", "cppRate", "deathBenefit", "tfsaLimit", "survUnder65",
  "eiMax", "survFlat", "cpp2Rate", "eiRate", "survOver65", "oasMaxMonthly", "cppExemption", "cppMax65"];
// RRIF factors by age at January 1
const RRIF_AGES = Array.from({ length: 25 }, (_, i) => 71 + i);
const NEEDS_REVIEW = "Needs review";

const dryRun = process.argv.includes("--dry-run");

/* ---------- reading Airtable ---------- */

function readToken() {
  if (process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN.trim();
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?AIRTABLE_TOKEN\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^(['"])(.*)\1$/, "$2").trim();
    }
  }
  return "";
}

async function fetchTable(token, table) {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable refused to read "${table}" (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }
    const page = await res.json();
    records.push(...page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

/* ---------- building the app's figures ---------- */

// Collects every problem instead of stopping at the first, so one run shows them all
const problems = [];
const problem = msg => problems.push(msg);

const isNum = v => typeof v === "number" && Number.isFinite(v);
function num(v, what) {
  if (!isNum(v)) { problem(`${what} is missing.`); return NaN; }
  return v;
}

// "Special rules": JSON on the first line, then a plain explanation
function specialRules(text, code) {
  const first = String(text || "").split(/\r?\n/)[0].trim();
  if (!first) return {};
  try {
    const rules = JSON.parse(first);
    if (rules && typeof rules === "object" && !Array.isArray(rules)) return rules;
  } catch { /* reported below */ }
  problem(`${code}: the first line of "Special rules" is not a JSON object: ${first}`);
  return {};
}

function brackets(code, rows, taxYear) {
  const sorted = [...rows].sort((a, b) => (a.fields.Order ?? 0) - (b.fields.Order ?? 0));
  if (!sorted.length) { problem(`${code} has no tax brackets.`); return []; }
  let prev = 0;
  return sorted.map((r, i) => {
    const f = r.fields, last = i === sorted.length - 1, label = f.Bracket || `${code} bracket ${i + 1}`;
    if (f.Order !== i + 1) problem(`${label}: "Order" should be ${i + 1} but is ${f.Order ?? "blank"}.`);
    if (taxYear != null && f["Tax year"] != null && f["Tax year"] !== taxYear)
      problem(`${label} is for tax year ${f["Tax year"]}, but ${code} is for ${taxYear}.`);
    const rate = num(f.Rate, `${label} "Rate"`);
    if (isNum(rate) && (rate <= 0 || rate >= 1)) problem(`${label}: rate ${rate} is not between 0% and 100%.`);
    const top = f["Up to"];
    if (last) {
      if (top != null) problem(`${label} is the top bracket, so "Up to" should be blank (no upper limit).`);
      return [null, rate];
    }
    if (!isNum(top)) problem(`${label}: "Up to" is blank, but only the top bracket can have no upper limit.`);
    else if (top <= prev) problem(`${label}: "Up to" (${top}) is not above the bracket below it (${prev}).`);
    prev = isNum(top) ? top : prev;
    return [top, rate];
  });
}

function build(t) {
  const jurByCode = {}, jurById = {};
  for (const r of t.jur) {
    const code = r.fields.Code;
    if (!code) { problem(`A jurisdiction (${r.fields.Name || r.id}) has no "Code".`); continue; }
    if (jurByCode[code]) problem(`Two jurisdictions use the code ${code}.`);
    jurByCode[code] = r; jurById[r.id] = code;
  }
  const brByCode = {};
  for (const r of t.br) {
    const links = r.fields.Jurisdiction || [];
    if (links.length !== 1) { problem(`Bracket ${r.fields.Bracket || r.id} should link to exactly one jurisdiction.`); continue; }
    const code = jurById[links[0]];
    if (code) (brByCode[code] ||= []).push(r);
  }
  for (const code of Object.keys(jurByCode))
    if (code !== "FED" && !PROVINCES.includes(code)) problem(`Jurisdiction ${code} is not one the app knows.`);

  const common = (code, f) => ({
    br: brackets(code, brByCode[code] || [], f["Tax year"]),
    rate: num(f["Credit rate"], `${code} "Credit rate"`),
  });

  // Federal
  let fed = {}, cea = NaN;
  const fr = jurByCode.FED;
  if (!fr) problem("The Federal jurisdiction (code FED) is missing.");
  else {
    const f = fr.fields, rules = specialRules(f["Special rules"], "FED");
    const { bpaPhase, canadaEmploymentAmount, ...other } = rules;
    for (const k of Object.keys(other)) problem(`FED: special rule "${k}" is not one the app knows.`);
    if (!bpaPhase) problem('FED: "Special rules" needs bpaPhase (the basic personal amount phase-out).');
    fed = {
      ...common("FED", f),
      bpaMax: num(f["Basic personal amount"], 'FED "Basic personal amount"'),
      bpaMin: num(bpaPhase?.min, "FED bpaPhase.min"),
      bpaLo: num(bpaPhase?.lo, "FED bpaPhase.lo"),
      bpaHi: num(bpaPhase?.hi, "FED bpaPhase.hi"),
      age: num(f["Age amount"], 'FED "Age amount"'),
      ageThr: num(f["Age amount threshold"], 'FED "Age amount threshold"'),
      pen: num(f["Pension amount"], 'FED "Pension amount"'),
    };
    cea = num(canadaEmploymentAmount, "FED canadaEmploymentAmount (Canada employment amount)");
  }

  // Provinces and territories
  const prov = {};
  for (const code of PROVINCES) {
    const r = jurByCode[code];
    if (!r) { problem(`Jurisdiction ${code} is missing.`); continue; }
    const f = r.fields, rules = specialRules(f["Special rules"], code);
    const { bpaMirrorsFederal, quebec, bpaPhase, surtax, healthPremium, bcReduction, seniorSupplement, ...other } = rules;
    for (const k of Object.keys(other)) problem(`${code}: special rule "${k}" is not one the app knows.`);
    const fig = (field, key) => num(f[field], `${code} "${field}"`);
    const p = { name: f.Name || code, ...common(code, f) };
    if (bpaMirrorsFederal) p.bpaFed = true;
    else p.bpa = fig("Basic personal amount");
    if (quebec) {
      p.qc = {
        age: num(quebec.age, `${code} quebec.age`),
        ret: num(quebec.retirementIncome, `${code} quebec.retirementIncome`),
        alone: num(quebec.livingAlone, `${code} quebec.livingAlone`),
        thr: num(quebec.familyThreshold, `${code} quebec.familyThreshold`),
        red: num(quebec.reductionRate, `${code} quebec.reductionRate`),
        abate: num(quebec.federalAbatement, `${code} quebec.federalAbatement`),
      };
      // Quebec's amounts are reduced together, so the app reads them from the rule, not the columns
      for (const [field, v] of [["Age amount", p.qc.age], ["Age amount threshold", p.qc.thr], ["Pension amount", p.qc.ret]])
        if (f[field] != null && f[field] !== v) problem(`${code}: "${field}" (${f[field]}) differs from the Quebec rule (${v}).`);
    } else {
      p.age = fig("Age amount");
      p.ageThr = fig("Age amount threshold");
      p.pen = fig("Pension amount");
    }
    if (bpaPhase) p.bpaPhase = [num(bpaPhase.lo, `${code} bpaPhase.lo`), num(bpaPhase.hi, `${code} bpaPhase.hi`), num(bpaPhase.min, `${code} bpaPhase.min`)];
    if (seniorSupplement != null) p.seniorSupp = num(seniorSupplement, `${code} seniorSupplement`);
    if (surtax) {
      if (!Array.isArray(surtax) || !surtax.every(s => Array.isArray(s) && s.length === 2 && s.every(isNum)))
        problem(`${code}: surtax should be a list of [threshold, rate] pairs.`);
      p.onSurtax = surtax;
    }
    if (healthPremium) p.onHealth = true;
    if (bcReduction) p.bcRed = {
      max: num(bcReduction.max, `${code} bcReduction.max`),
      thr: num(bcReduction.threshold, `${code} bcReduction.threshold`),
      rate: num(bcReduction.rate, `${code} bcReduction.rate`),
    };
    prov[code] = p;
  }

  // Benefits & limits, in the order the file already has them, so unchanged figures give an unchanged file
  const benByKey = {};
  for (const r of t.ben) {
    const key = r.fields.Key;
    if (!key) continue;
    if (benByKey[key]) problem(`Two "Benefits & limits" rows use the key ${key}.`);
    benByKey[key] = r;
  }
  const benefits = {};
  for (const key of BENEFIT_KEYS) {
    if (!benByKey[key]) { problem(`"Benefits & limits" has no row with the key ${key}.`); continue; }
    benefits[key] = num(benByKey[key].fields.Value, `Benefit ${key} "Value"`);
  }
  // Keys the app doesn't read yet are carried along, so they're ready when it does
  for (const key of Object.keys(benByKey).sort())
    if (!BENEFIT_KEYS.includes(key)) benefits[key] = num(benByKey[key].fields.Value, `Benefit ${key} "Value"`);

  // RRIF minimums
  const rrifByAge = {};
  for (const r of t.rrif) {
    const age = r.fields["Age at January 1"];
    if (isNum(age)) rrifByAge[age] = r;
  }
  const rrif = {};
  for (const age of RRIF_AGES) {
    if (!rrifByAge[age]) { problem(`RRIF minimums has no row for age ${age}.`); continue; }
    const v = num(rrifByAge[age].fields.Minimum, `RRIF minimum at age ${age}`);
    if (isNum(v) && (v <= 0 || v > 1)) problem(`RRIF minimum at age ${age} (${v}) is not between 0% and 100%.`);
    rrif[age] = v;
  }

  // "Needs review": jurisdictions by code, benefits by key, and the RRIF table as a whole
  const status = r => r.fields.Status?.name ?? r.fields.Status;
  const needsReview = [
    ...["FED", ...PROVINCES].filter(c => jurByCode[c] && status(jurByCode[c]) === NEEDS_REVIEW),
    ...Object.keys(benefits).filter(k => status(benByKey[k]) === NEEDS_REVIEW),
    ...(t.rrif.some(r => status(r) === NEEDS_REVIEW) ? ["RRIF minimums"] : []),
  ];
  const reviewDetail = [
    ...["FED", ...PROVINCES].filter(c => needsReview.includes(c)).map(c => `${c} (${jurByCode[c].fields.Name})`),
    ...Object.keys(benefits).filter(k => needsReview.includes(k)).map(k => `${k} (${benByKey[k].fields.Name}): ${benefits[k]}`),
    ...t.rrif.filter(r => status(r) === NEEDS_REVIEW).map(r => r.fields["Age at January 1"]).sort((a, b) => a - b)
      .reduce((s, a, i, all) => i ? s : [`RRIF minimums, ${all.length} of ${t.rrif.length} ages (${all[0]} to ${all[all.length - 1]})`], []),
  ];

  // "Verified": the oldest "Last verified" date among the rows marked Verified
  const dates = [...t.jur, ...t.ben].filter(r => status(r) === "Verified").map(r => r.fields["Last verified"]).filter(Boolean).sort();
  if (!dates.length) problem('No row has a "Last verified" date.');

  return { data: { fed, prov, cea, benefits, rrif, verified: dates[0], needsReview }, reviewDetail };
}

/* ---------- comparing and writing ---------- */

// Every figure as "path: value", so two versions can be compared line by line
function flatten(v, at = "", out = {}) {
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, at ? `${at}.${k}` : k, out);
  else out[at] = v;
  return out;
}

// "prov.ON.br.1.1" reads better as "ON bracket 2 rate"
function label(at) {
  const m = at.match(/^(?:prov\.(\w+)|fed)\.br\.(\d+)\.([01])$/);
  if (m) return `${m[1] || "FED"} bracket ${+m[2] + 1} ${m[3] === "0" ? "upper limit" : "rate"}`;
  return at.replace(/^prov\./, "").replace(/^fed\./, "FED ").replace(/^benefits\./, "benefit ").replace(/^rrif\.(\d+)$/, "RRIF minimum at age $1");
}

// The file's existing layout: two-space indents, and a list of plain values kept on one line
function format(v, indent = "") {
  if (Array.isArray(v)) {
    if (v.every(x => x === null || typeof x !== "object")) return `[${v.map(x => JSON.stringify(x)).join(", ")}]`;
    const inner = indent + "  ";
    return `[\n${v.map(x => inner + format(x, inner)).join(",\n")}\n${indent}]`;
  }
  if (v && typeof v === "object") {
    const inner = indent + "  ";
    return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(v);
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

async function main() {
  const token = readToken();
  if (!token) {
    console.error("No Airtable token found. Put AIRTABLE_TOKEN=... in a .env file in the project folder\n" +
      "(it's ignored by git), or set AIRTABLE_TOKEN in your environment.");
    process.exit(1);
  }

  console.log(`Reading Airtable base ${BASE_ID}...`);
  const t = {};
  for (const [k, name] of Object.entries(TABLES)) t[k] = await fetchTable(token, name);
  console.log(`  ${t.jur.length} jurisdictions, ${t.br.length} brackets, ${t.ben.length} benefits and limits, ${t.rrif.length} RRIF minimums\n`);

  const { data, reviewDetail } = build(t);
  if (problems.length) {
    console.error(`Not written: ${problems.length} problem${problems.length > 1 ? "s" : ""} in the base.\n`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const { source: _s, synced: _d, ...oldFigures } = old;
  const before = flatten(oldFigures), after = flatten(data);
  const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => before[k] !== after[k])
    .map(k => !(k in before) ? `  + ${label(k)}: ${after[k]} (new)` : !(k in after) ? `  - ${label(k)}: ${before[k]} (removed)` : `  ~ ${label(k)}: ${before[k]} -> ${after[k]}`);

  console.log(`Checks passed: federal and ${Object.keys(data.prov).length} provinces and territories have brackets, ` +
    `${Object.keys(data.benefits).length} benefit figures, RRIF minimums for ages ${RRIF_AGES[0]} to ${RRIF_AGES.at(-1)}.\n`);
  console.log(changes.length ? `Changed since the last sync (${old.synced || "never"}):\n${changes.join("\n")}\n`
    : `No figures changed since the last sync (${old.synced || "never"}).\n`);
  console.log(reviewDetail.length ? `Still marked "Needs review":\n${reviewDetail.map(s => "  - " + s).join("\n")}\n` : 'Nothing is marked "Needs review".\n');

  if (!changes.length) { console.log("The file is up to date; nothing written."); return; }
  if (dryRun) { console.log("Dry run: nothing written."); return; }
  const out = { source: `Airtable base ${BASE_ID}`, synced: today(), ...data };
  fs.writeFileSync(OUT, format(out) + "\n");
  console.log(`Wrote ${path.relative(ROOT, OUT)}. Run npm test: any change to the figures will show up as golden test differences.`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
