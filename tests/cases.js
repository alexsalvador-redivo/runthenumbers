// Sample households and input grids for the golden tests.
// Each plan is complete on its own (no dependence on the app's EXAMPLE), so a change to
// the example plan only moves the "example" snapshot.

// The two moments the tests pin "today" to. Results depend on the date:
// late October starts with a partial 2026; late December skips to a full 2027.
const DATES = {
  "2026-10-24": "2026-10-24T12:00:00-04:00",
  "2026-12-20": "2026-12-20T12:00:00-05:00",
};

const BASE = {
  people: [
    { name: "Spouse 1", birthYear: 1968, retireAge: 62, lifeAge: 87, salary: 118000, rrsp: 420000, tfsa: 95000, nonreg: 60000, rrspContrib: 15000, tfsaContrib: 7000, tfsaRoom: 20000, pension: 0, pensionStart: 65, survPct: 60, cpp65: 1150, cppStart: 65, oasYears: 40, oasStart: 65 },
    { name: "Spouse 2", birthYear: 1970, retireAge: 60, lifeAge: 94, salary: 82000, rrsp: 210000, tfsa: 88000, nonreg: 0, rrspContrib: 8000, tfsaContrib: 7000, tfsaRoom: 15000, pension: 18000, pensionStart: 60, survPct: 60, cpp65: 900, cppStart: 65, oasYears: 40, oasStart: 65 },
  ],
  house: { province: "BC", cash: 30000, spending: 90000, spendingLater: 75000, spendingChangeAge: 78, survivorSpend: 70, homeValue: 1400000, mortgage: 180000, mortgageRate: 4.5, mortgagePayment: 24000, downsizeAge: 0, downsizeAmount: 0, ltcCost: 0, ltcAge: 85,
    events: [{ label: "Replace the car", kind: "expense", amount: 40000, age: 63, every: 10, until: 83, who: "0" }, { label: "New roof", kind: "expense", amount: 25000, age: 70, every: 0, until: 0, who: "0" }] },
  assume: { returnRate: 5.5, cashRate: 2.5, inflation: 2.5, volatility: 10, flexCut: 0, split: "yes", cppShare: "no", cppShareYears: 100, order: "cash,nonreg,rrsp,tfsa", meltTarget: 0, meltEnd: 71 },
};

// Copy BASE and apply a patch: people[i], house and assume are merged key by key.
function plan(patch = {}) {
  const d = JSON.parse(JSON.stringify(BASE));
  (patch.people || []).forEach((p, i) => Object.assign(d.people[i], p));
  Object.assign(d.house, patch.house || {});
  Object.assign(d.assume, patch.assume || {});
  return d;
}

const NO_EVENTS = { events: [] };
const single = (p, house = {}, assume = {}) => plan({ people: [p, { name: "Partner" }], house: { mode: "single", ...NO_EVENTS, ...house }, assume });

// name -> plan. "example" is filled in from the page's own EXAMPLE.
const PLANS = {
  example: null,

  // Ontario couple: CPP sharing, CPP and OAS both at 70, RRSP drawdown to $55k through 71
  "on-couple-delay-share-melt": plan({
    people: [{ cppStart: 70, oasStart: 70 }, { cppStart: 70, oasStart: 70, cpp65: 600 }],
    house: { province: "ON" },
    assume: { cppShare: "yes", cppShareYears: 80, meltTarget: 55000, meltEnd: 71 },
  }),

  // Quebec couple with QPP at 60 and 67, a DB pension and pension splitting
  "qc-couple-pension-split": plan({
    people: [{ birthYear: 1964, retireAge: 61, cppStart: 60, pension: 42000, pensionStart: 61, survPct: 50 }, { birthYear: 1966, retireAge: 60, cppStart: 67, pension: 0 }],
    house: { province: "QC", homeValue: 650000, mortgage: 0, mortgagePayment: 0 },
  }),

  // Same Quebec couple without pension splitting
  "qc-couple-no-split": plan({
    people: [{ birthYear: 1964, retireAge: 61, cppStart: 60, pension: 42000, pensionStart: 61, survPct: 50 }, { birthYear: 1966, retireAge: 60, cppStart: 67, pension: 0 }],
    house: { province: "QC", homeValue: 650000, mortgage: 0, mortgagePayment: 0 },
    assume: { split: "no" },
  }),

  // Alberta high earner on their own: OAS clawback territory
  "ab-single-high-income": single(
    { name: "Robin", birthYear: 1962, retireAge: 66, lifeAge: 92, salary: 240000, rrsp: 1600000, tfsa: 140000, nonreg: 500000, rrspContrib: 32000, tfsaContrib: 7000, tfsaRoom: 0, pension: 60000, pensionStart: 66, cpp65: 1433, cppStart: 65, oasYears: 40, oasStart: 65 },
    { province: "AB", cash: 80000, spending: 140000, spendingLater: 110000, spendingChangeAge: 80, homeValue: 1100000, mortgage: 0, mortgagePayment: 0 }),

  // Nova Scotia single, modest savings, early CPP, partial OAS (22 years in Canada)
  "ns-single-early-cpp-partial-oas": single(
    { name: "Sam", birthYear: 1965, retireAge: 61, lifeAge: 90, salary: 52000, rrsp: 85000, tfsa: 30000, nonreg: 0, rrspContrib: 3000, tfsaContrib: 2000, tfsaRoom: 40000, pension: 0, pensionStart: 65, cpp65: 640, cppStart: 60, oasYears: 22, oasStart: 65 },
    { province: "NS", cash: 12000, spending: 38000, spendingLater: 34000, spendingChangeAge: 80, homeValue: 0, mortgage: 0, mortgagePayment: 0 }),

  // Newcomer with under 10 years in Canada: no OAS
  "bc-single-no-oas": single(
    { name: "Lee", birthYear: 1970, retireAge: 65, lifeAge: 90, salary: 90000, rrsp: 150000, tfsa: 40000, nonreg: 20000, rrspContrib: 10000, tfsaContrib: 7000, tfsaRoom: 30000, pension: 0, pensionStart: 65, cpp65: 400, cppStart: 65, oasYears: 8, oasStart: 65 },
    { province: "BC", cash: 15000, spending: 55000, spendingLater: 50000, spendingChangeAge: 80, homeValue: 0, mortgage: 0, mortgagePayment: 0 }),

  // Manitoba couple already retired and past 72: RRIF minimums, OAS over 75
  "mb-couple-retired-rrif": plan({
    people: [{ birthYear: 1950, retireAge: 60, lifeAge: 95, salary: 0, rrsp: 520000, tfsa: 110000, nonreg: 150000, rrspContrib: 0, tfsaContrib: 0, pension: 24000, pensionStart: 60, cpp65: 1100, cppStart: 65, oasStart: 65 },
             { birthYear: 1953, retireAge: 58, lifeAge: 92, salary: 0, rrsp: 300000, tfsa: 95000, nonreg: 0, rrspContrib: 0, tfsaContrib: 0, pension: 0, cpp65: 700, cppStart: 62, oasStart: 67 }],
    house: { province: "MB", ...NO_EVENTS, spending: 70000, spendingLater: 60000, spendingChangeAge: 85, homeValue: 450000, mortgage: 0, mortgagePayment: 0 },
  }),

  // Saskatchewan couple that runs out of money
  "sk-couple-runs-short": plan({
    people: [{ rrsp: 120000, tfsa: 20000, nonreg: 0, lifeAge: 95 }, { rrsp: 60000, tfsa: 15000, pension: 0, lifeAge: 95 }],
    house: { province: "SK", spending: 120000, spendingLater: 110000, cash: 5000 },
  }),

  // One spouse dies early: survivor pension, survivor CPP, rollover, survivor spending
  "on-couple-early-death": plan({
    people: [{ lifeAge: 71, pension: 55000, pensionStart: 62, survPct: 60, cppStart: 65 }, { lifeAge: 95, cpp65: 500, cppStart: 60 }],
    house: { province: "ON", survivorSpend: 65 },
  }),

  // Survivor under 65 when the spouse dies
  "nb-couple-death-before-65": plan({
    people: [{ birthYear: 1962, lifeAge: 66, cppStart: 60, pension: 30000, pensionStart: 60, retireAge: 60 }, { birthYear: 1975, retireAge: 62, lifeAge: 90, cppStart: 65 }],
    house: { province: "NB", survivorSpend: 75 },
  }),

  // Lots of events: taxable income, inheritance, downsizing, long-term care, flex spending
  "nb-couple-events-downsize-ltc": plan({
    house: { province: "NB", downsizeAge: 75, downsizeAmount: 500000, ltcCost: 40000, ltcAge: 86,
      events: [
        { label: "Consulting", kind: "income", amount: 30000, age: 62, every: 1, until: 66, who: "1" },
        { label: "Inheritance", kind: "free", amount: 250000, age: 64, every: 0, until: 0, who: "0" },
        { label: "Trip", kind: "expense", amount: 15000, age: 63, every: 2, until: 75, who: "0" },
        { label: "Help the kids", kind: "expense", amount: 60000, age: 66, every: 0, until: 0, who: "0" },
      ] },
    assume: { flexCut: 10 },
  }),

  // Different withdrawal orders
  "pe-couple-order-rrsp-first": plan({ house: { province: "PE" }, assume: { order: "cash,rrsp,nonreg,tfsa" } }),
  "nl-couple-order-tfsa-before-rrsp": plan({ house: { province: "NL" }, assume: { order: "cash,nonreg,tfsa,rrsp", meltTarget: 70000, meltEnd: 71 } }),

  // Territories, with a large mortgage and higher rates
  "yt-couple-big-mortgage": plan({ house: { province: "YT", mortgage: 600000, mortgageRate: 6.5, mortgagePayment: 42000 }, assume: { returnRate: 7, inflation: 3 } }),
  "nt-couple-low-returns": plan({ house: { province: "NT" }, assume: { returnRate: 3, cashRate: 1, inflation: 2.5 } }),
  "nu-single": single(
    { name: "Ari", birthYear: 1972, retireAge: 63, lifeAge: 88, salary: 130000, rrsp: 300000, tfsa: 70000, nonreg: 40000, rrspContrib: 18000, tfsaContrib: 7000, tfsaRoom: 10000, pension: 35000, pensionStart: 63, cpp65: 1200, cppStart: 68, oasYears: 40, oasStart: 69 },
    { province: "NU", cash: 20000, spending: 75000, spendingLater: 65000, spendingChangeAge: 78 }),

  // Quebec single over 65 (lives-alone amount, QC age credit)
  "qc-single-senior": single(
    { name: "Dominique", birthYear: 1957, retireAge: 65, lifeAge: 93, salary: 0, rrsp: 380000, tfsa: 60000, nonreg: 90000, rrspContrib: 0, tfsaContrib: 0, tfsaRoom: 30000, pension: 20000, pensionStart: 65, cpp65: 1000, cppStart: 66, oasYears: 40, oasStart: 65 },
    { province: "QC", cash: 25000, spending: 52000, spendingLater: 46000, spendingChangeAge: 82, homeValue: 400000, mortgage: 0, mortgagePayment: 0 }),
};

// Every province and territory, run on the base couple so the province switch in simulate is covered.
const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];
PROVINCES.forEach(p => { PLANS["base-couple-" + p.toLowerCase()] = plan({ house: { province: p } }); });

// A single person in every province and territory.
const BASE_SINGLE = { name: "Pat", birthYear: 1967, retireAge: 64, lifeAge: 92, salary: 95000, rrsp: 380000, tfsa: 90000, nonreg: 40000, rrspContrib: 12000, tfsaContrib: 7000, tfsaRoom: 15000, pension: 0, pensionStart: 65, cpp65: 1050, cppStart: 65, oasYears: 40, oasStart: 65 };
PROVINCES.forEach(p => { PLANS["base-single-" + p.toLowerCase()] = single(BASE_SINGLE, { province: p, cash: 20000, spending: 58000, spendingLater: 50000, spendingChangeAge: 80, homeValue: 600000, mortgage: 0, mortgagePayment: 0 }); });

// CPP sharing on, to pair with base-couple-bc (off). Uneven CPP so sharing matters.
PLANS["base-couple-bc-cpp-share"] = plan({ people: [{ cpp65: 1350 }, { cpp65: 450 }], assume: { cppShare: "yes", cppShareYears: 100 } });
PLANS["base-couple-bc-cpp-no-share"] = plan({ people: [{ cpp65: 1350 }, { cpp65: 450 }], assume: { cppShare: "no" } });

// The example plan with an RRSP drawdown target of $55,000 (filled in from the page's EXAMPLE).
const EXAMPLE_PATCHES = { "example-melt-55k": { assume: { meltTarget: 55000 } } };
PLANS["example-melt-55k"] = null;

// Spot checks: combined federal + provincial marginal rate on extra ordinary income, under 65.
const MARGINAL = [
  { province: "BC", age: 45, income: 30000, rate: 23.16 },
  { province: "BC", age: 45, income: 80000, rate: 28.2 },
  { province: "BC", age: 45, income: 150000, rate: 40.7 },
  { province: "BC", age: 45, income: 300000, rate: 53.5 },
];

// Extra checks that run only on a few plans because they are slower.
const FIND_TARGETS = ["example", "on-couple-delay-share-melt", "ab-single-high-income", "qc-couple-pension-split"];
const MONTE_CARLO = { N: 500, plans: ["example", "sk-couple-runs-short", "qc-couple-pension-split"] };
const QUICK_MC_N = 60;

// An old backup from before several fields existed, to prove migrate keeps old data working.
const OLD_STORE = {
  active: "a",
  scenarios: [{ id: "a", name: "Old plan", data: {
    people: [
      { name: "A", birthYear: 1966, retireAge: 63, takeHome: 70000, rrsp: 300000, tfsa: 60000, nonreg: 0, rrspContrib: 10000, tfsaContrib: 6000, pension: 0, pensionStart: 65, cpp65: 1000, cppStart: 65, oasYears: 40, oasStart: 65 },
      { name: "B", birthYear: 1968, retireAge: 62, takeHome: 50000, rrsp: 150000, tfsa: 50000, nonreg: 0, rrspContrib: 6000, tfsaContrib: 6000, pension: 12000, pensionStart: 62, cpp65: 800, cppStart: 65, oasYears: 40, oasStart: 65 },
    ],
    house: { cash: 20000, spending: 70000, spendingLater: 60000, spendingChangeAge: 80, homeValue: 700000, mortgage: 50000, mortgageRate: 4, mortgagePayment: 12000, downsizeAge: 0, downsizeAmount: 0 },
    assume: { returnRate: 5, cashRate: 2, inflation: 2.5, taxRate: 25, endAge: 92, order: "cash,nonreg,rrsp,tfsa" },
  } }],
};

module.exports = { DATES, PLANS, EXAMPLE_PATCHES, MARGINAL, PROVINCES, FIND_TARGETS, MONTE_CARLO, QUICK_MC_N, OLD_STORE };
