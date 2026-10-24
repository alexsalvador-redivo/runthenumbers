# Run The Numbers

A retirement projection calculator for Canadians, single or as a couple, in any province or territory. You enter savings (RRSP/RRIF, TFSA, non-registered, cash), income, pensions, CPP/QPP and OAS timing, home and mortgage, big expenses and windfalls, and the app projects year by year, in today's dollars, whether the money lasts. It handles federal and provincial tax, the OAS clawback, pension splitting, CPP sharing, RRIF minimums, survivor rollovers and benefits, and market-risk testing.

It is a small Vite project in plain JavaScript (no framework). `npm run build` produces a static site in `dist/`. Until October 2026 it was a single file, `run-the-numbers.html`; that file is in the git history (commit `caf77c1`).

## Goals

- **Educational demo.** It shows what a careful, plain-language retirement model looks like. It is not financial, tax or legal advice, and the page must keep saying so.
- **All user data stays in the visitor's browser.** Scenarios live in `localStorage` (key `run-the-numbers-v1`) and move between devices only through the copy/paste backup. Nothing a visitor types is ever sent anywhere.
- **No accounts and no server.** It is a static site. No login, no database, no analytics that capture inputs, no backend functions holding user data.
- **Standalone.** The target is an installable web app (PWA) hosted on Netlify, with no dependency on claude.ai.

## Rules

1. **The tax engine's results must never change unless Alex explicitly asks for it.** For the same inputs, the numbers must stay identical to the last digit. This covers:
   - the tax data in `src/data/tax-data.json` (brackets, credits, benefit figures, RRIF factors);
   - `personTax`, `houseTax`, `bracketTax`, `payroll`, `onHealth`, `cppAnnual`, `oasAnnual`, `survCppAnnual`, `rrifFactor`;
   - `simulate`, `findTargets`, `mcRun`, `quickMC` and the fixed Monte Carlo seed (`20261023`);
   - the example plan (`EXAMPLE`) and the `migrate` defaults.

   Refactors such as moving code into modules, renaming, or reformatting are fine only if outputs stay identical. Prove it with the golden tests (see below) before and after. If a change would move any number, stop and ask first, and say which numbers move and by how much.
2. **Never send user data off the device.** No fetch/XHR/beacon carrying inputs or results, no third-party scripts that can read the page. Any new network request needs Alex's OK.
3. **Keep the backup format compatible.** Existing backups (`{"app":"run-the-numbers","version":1,...}`) must keep restoring. Add migrations; don't break old data.
4. **Keep it a static site.** No server code, accounts or paid services without asking.
5. **Plain language** in the UI, matching the existing voice: short sentences, Canadian spelling, today's dollars.

## How the code is laid out

- `index.html`: the page skeleton and markup: header with scenario tabs; quick-start wizard; results column (verdict and takeaways, stats, chart, Market risk, Find my best plan, What would it take?, RRSP drawdown finder, scenario comparison, year-by-year table); inputs column (scenario, backup, people, household, events, assumptions, "How tax is handled").
- `src/styles.css`: colour tokens on `:root` with light and dark themes; two-column layout (results left, inputs right) that stacks on phones.
- `src/data/tax-data.json`: the tax and benefit figures, generated from an Airtable base (sync script not in this repo yet). Don't hand-edit it. JSON has no `Infinity`, so each top bracket stores `null` for "no upper limit"; `src/data/tax-data.js` turns that back into `Infinity`. The figures are built into the app, so visitors' browsers never contact Airtable.
- `src/engine/`: the numbers, with no page code.
  - `dates.js`: `TODAY`, `START_YEAR`, `F0` (the partial first year).
  - `benefits.js`: CPP/OAS/survivor figures, `cppAnnual`, `oasAnnual`, `survCppAnnual`, `rrifFactor`.
  - `tax.js`: `bracketTax`, `payroll`, `onHealth`, `personTax`, `houseTax`. The province in use is module state, set with `setPV` (as `simulate` does).
  - `plan.js`: `EXAMPLE`, withdrawal `ORDERS`, single/couple helpers.
  - `simulate.js`: `simulate`, `findTargets`.
  - `montecarlo.js`: `rng`, `mcRun`, `quickMC` with the fixed seed. `mc.job` is the current run; `++mc.job` stops any run still going.
- `src/storage.js`: `load`, `validStore`, `migrate`, `save`, the scenario `store` and `active()`.
- `src/ui/`: the screens. `form.js` and `fields.js` (inputs and `HELP`), `results.js` (`render`, table, compare, `takeaways`), `chart.js` (canvas charts, including the PDF chart), `scenarios.js` (tabs, drawdown finder, backup/restore), `risk.js` (stress test, market histories, "What would it take?"), `optimizer.js` (`combos`, `runOptimizer`), `report.js` (PDF with jsPDF from npm, saved as a normal browser download), `quickstart.js`, `format.js`.
- `src/main.js`: loads everything and starts the app. `src/golden-hooks.js` is only built for the golden tests.
- `src/fonts.css` and `src/fonts/`: the three fonts (latin subset, from Fontsource, SIL Open Font License), served with the app.
- `public/`: `favicon.svg` and `icons/` (192, 512, maskable 512, Apple touch 180; drawn from `icons/icon.svg`).
- **Installable app (PWA)**: `vite-plugin-pwa` in `vite.config.mjs` writes `manifest.webmanifest`, `sw.js` and `registerSW.js` at build time. The service worker precaches the app on the first visit so it opens offline; with `autoUpdate`, a newly published version downloads in the background and is used from the next launch. jsPDF's unused HTML helpers (html2canvas, DOMPurify, canvg) are left out of the precache. The golden tests block service workers.

## Things to know

- **Results depend on today's date.** `START_YEAR` and the partial first year (`F0`) come from `new Date()`. Tests must pin the date to get repeatable numbers.
- **No `window.claude`.** The app no longer uses the claude.ai Artifact runtime. Two features that needed it were removed in October 2026 for version 1 (Alex's decision): **Ask about your plan** (a chat panel that sent the plan to Claude, with tools to test a change, run market histories and propose a change with an Apply button) and **Explain these plans** (a button under the optimizer results that asked Claude to compare the three plans). Both could return later through a small server-side API proxy that holds the API key, but that breaks "no server" and sends plan data off the device, so it needs Alex's OK first (rules 2 and 4). Their code is in the git history just before the commit that removed them (`src/ui/ask.js`, and `explainOpt` in `src/ui/optimizer.js`).
- **No external loads.** Fonts are self-hosted; jsPDF and jspdf-autotable are npm packages, bundled by Vite and downloaded only when someone builds a PDF (and precached for offline use).
- `npm run dev` serves the app with live reload; `npm run build` then `npm run preview` serves the built site.

## Testing

Golden-output tests lock in today's tax and simulation results. Run them before and after every change:

```
npm install                      # once; then `npx playwright install chromium` if Chromium isn't installed
npm test                         # compares to tests/golden/, exact to the last digit
npm run golden:update            # re-records the snapshots. Only after Alex OKs a change in results
```

- `tests/harness.js` builds the app with `vite build --mode golden`, then opens it in headless Chromium with the date pinned, the time zone set to America/Toronto, and every network request blocked. The golden build adds `src/golden-hooks.js`, which exposes the engine as `window.__RTN`; the published build leaves it out. The tax data's SHA-256 is taken over the old `<script id="taxData">` text rebuilt from the data the app runs with, so the hash in the snapshots still proves the figures are unchanged.
- `tests/cases.js` holds the households: the example plan, 17 varied plans (single and couple; BC, AB, SK, MB, ON, QC, NB, NS, PE, NL, YT, NT, NU; early CPP, delayed CPP/OAS, CPP sharing, partial and no OAS, OAS clawback, pension splitting on and off, RRIF minimums, RRSP drawdown, every withdrawal order, deaths before and after 65, survivor benefits, events, downsizing, long-term care, flexible spending, running short), the base couple and a base single person in all 13 provinces and territories, a CPP sharing on/off pair, and the example plan with a $55,000 RRSP drawdown target. Each runs at two pinned dates: 2026-10-24 (partial first year) and 2026-12-20 (starts with a full 2027).
- Saved per plan and date: the full `simulate` output, `quickMC`, and for some plans `findTargets` and a 500-run `mcRun` with the fixed seed. `engine.json` holds direct checks of `personTax` (all 14 jurisdictions), `houseTax`, `payroll`, `cppAnnual`, `oasAnnual`, `survCppAnnual`, `rrifFactor`, `onHealth`, and a SHA-256 of the tax data. `migrate.json` proves an old backup still restores.
- Fixed spot checks, run every time: BC combined marginal rates under 65 at $30k, $80k, $150k and $300k must be 23.16%, 28.2%, 40.7% and 53.5% (`MARGINAL` in `tests/cases.js`).
- `tests/golden/SUMMARY.md` is a readable table of the headline numbers.
- GitHub Actions runs `npm test` on every push and pull request (`.github/workflows/golden-tests.yml`).
- `node tests/golden.test.js --html some-copy.html` checks an old single-file copy of the app (for example `git show caf77c1:run-the-numbers.html > old.html`) against the same snapshots.

## Roadmap

1. Orient and plan (done): this file, git repository.
2. Golden tests that lock in today's tax and simulation results (done).
3. Standalone page: Vite project with an HTML skeleton and jsPDF from npm (done), PDF saved as a normal browser download and the Claude-only features (Ask about your plan, Explain these plans) removed (done, Alex's decision 2026-10-24), self-hosted fonts (done).
4. PWA: manifest, icons, service worker for offline use (done). An in-app "Install" button is not added yet.
5. Netlify: `netlify.toml`, security headers (strict CSP with no outside connections), deploy from GitHub. Serve `sw.js`, `registerSW.js` and `manifest.webmanifest` with `Cache-Control: no-cache` so updates are picked up.
