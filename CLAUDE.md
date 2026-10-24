# Run The Numbers

A retirement projection calculator for Canadians, single or as a couple, in any province or territory. You enter savings (RRSP/RRIF, TFSA, non-registered, cash), income, pensions, CPP/QPP and OAS timing, home and mortgage, big expenses and windfalls, and the app projects year by year, in today's dollars, whether the money lasts. It handles federal and provincial tax, the OAS clawback, pension splitting, CPP sharing, RRIF minimums, survivor rollovers and benefits, and market-risk testing.

The whole app is one file today: `run-the-numbers.html` (HTML, CSS and vanilla JavaScript, no build step, no framework).

## Goals

- **Educational demo.** It shows what a careful, plain-language retirement model looks like. It is not financial, tax or legal advice, and the page must keep saying so.
- **All user data stays in the visitor's browser.** Scenarios live in `localStorage` (key `run-the-numbers-v1`) and move between devices only through the copy/paste backup. Nothing a visitor types is ever sent anywhere.
- **No accounts and no server.** It is a static site. No login, no database, no analytics that capture inputs, no backend functions holding user data.
- **Standalone.** The target is an installable web app (PWA) hosted on Netlify, with no dependency on claude.ai.

## Rules

1. **The tax engine's results must never change unless Alex explicitly asks for it.** For the same inputs, the numbers must stay identical to the last digit. This covers:
   - the tax data in `window.TAX_DATA` (brackets, credits, benefit figures, RRIF factors);
   - `personTax`, `houseTax`, `bracketTax`, `payroll`, `onHealth`, `cppAnnual`, `oasAnnual`, `survCppAnnual`, `rrifFactor`;
   - `simulate`, `findTargets`, `mcRun`, `quickMC` and the fixed Monte Carlo seed (`20261023`);
   - the example plan (`EXAMPLE`) and the `migrate` defaults.

   Refactors such as moving code into modules, renaming, or reformatting are fine only if outputs stay identical. Prove it with the golden tests (see below) before and after. If a change would move any number, stop and ask first, and say which numbers move and by how much.
2. **Never send user data off the device.** No fetch/XHR/beacon carrying inputs or results, no third-party scripts that can read the page. Any new network request needs Alex's OK.
3. **Keep the backup format compatible.** Existing backups (`{"app":"run-the-numbers","version":1,...}`) must keep restoring. Add migrations; don't break old data.
4. **Keep it a static site.** No server code, accounts or paid services without asking.
5. **Plain language** in the UI, matching the existing voice: short sentences, Canadian spelling, today's dollars.

## How the code is laid out (in `run-the-numbers.html`)

- **CSS** (top): colour tokens on `:root` with light and dark themes; two-column layout (results left, inputs right) that stacks on phones.
- **Markup**: header with scenario tabs; quick-start wizard; results column (verdict and takeaways, stats, chart, Ask panel, Market risk, Find my best plan, What would it take?, RRSP drawdown finder, scenario comparison, year-by-year table); inputs column (scenario, backup, people, household, events, assumptions, "How tax is handled").
- **`<script id="taxData">`**: `window.TAX_DATA`, generated from an Airtable base by `airtable-sync/sync.py` (that script is not in this repo). Do not hand-edit it.
- **Main script**, in order: benefit constants → `cppAnnual`/`oasAnnual` → tax engine (`bracketTax`, `payroll`, `personTax`, `houseTax`) → `simulate` → `findTargets` → storage (`load`, `validStore`, `migrate`, `save`) → form building (`PEOPLE_FIELDS`, `HOUSE_FIELDS`, `ASSUME_FIELDS`, `HELP`) → `render`, table, compare, `takeaways` → canvas chart → scenarios, drawdown finder → stress test and Monte Carlo (`rng`, `mcRun`, `runMC`) → "What would it take?" solver → backup/restore → **Ask about your plan** (uses `window.claude`) → **optimizer** (`combos`, `runOptimizer`, `explainOpt` uses `window.claude`) → **PDF report** (jsPDF from cdnjs, saved through `window.claude` downloads) → quick start.

## Things to know

- **Results depend on today's date.** `START_YEAR` and the partial first year (`F0`) come from `new Date()`. Tests must pin the date to get repeatable numbers.
- **`window.claude` dependencies** (claude.ai Artifact runtime): `window.claude.use("sample")` powers the Ask panel and "Explain these plans"; `window.claude.use("downloads")` saves the PDF. Each hides itself when `window.claude` is missing, so the rest of the app already works outside claude.ai.
- The file has no `<!doctype>`, `<html>`, `<head>` or viewport meta, because the claude.ai Artifact host wrapped it. A standalone page needs them.
- External loads today: Google Fonts, and jsPDF + autotable from cdnjs (only when building a PDF).

## Testing

Golden-output tests lock in today's tax and simulation results. Run them before and after every change:

```
npm install                      # once; then `npx playwright install chromium` if Chromium isn't installed
npm test                         # compares to tests/golden/, exact to the last digit
npm run golden:update            # re-records the snapshots. Only after Alex OKs a change in results
```

- `tests/harness.js` opens `run-the-numbers.html` in headless Chromium with the date pinned, the time zone set to America/Toronto, and every network request blocked. The main script is an IIFE, so the harness serves a copy with one line added before the IIFE closes that exposes the engine as `window.__RTN`. The app file is never changed. If the code moves into modules, update the harness to import from there and check the snapshots still match.
- `tests/cases.js` holds the households: the example plan, 17 varied plans (single and couple; BC, AB, SK, MB, ON, QC, NB, NS, PE, NL, YT, NT, NU; early CPP, delayed CPP/OAS, CPP sharing, partial and no OAS, OAS clawback, pension splitting on and off, RRIF minimums, RRSP drawdown, every withdrawal order, deaths before and after 65, survivor benefits, events, downsizing, long-term care, flexible spending, running short), the base couple and a base single person in all 13 provinces and territories, a CPP sharing on/off pair, and the example plan with a $55,000 RRSP drawdown target. Each runs at two pinned dates: 2026-10-24 (partial first year) and 2026-12-20 (starts with a full 2027).
- Saved per plan and date: the full `simulate` output, `quickMC`, and for some plans `findTargets` and a 500-run `mcRun` with the fixed seed. `engine.json` holds direct checks of `personTax` (all 14 jurisdictions), `houseTax`, `payroll`, `cppAnnual`, `oasAnnual`, `survCppAnnual`, `rrifFactor`, `onHealth`, and a SHA-256 of the tax data. `migrate.json` proves an old backup still restores.
- Fixed spot checks, run every time: BC combined marginal rates under 65 at $30k, $80k, $150k and $300k must be 23.16%, 28.2%, 40.7% and 53.5% (`MARGINAL` in `tests/cases.js`).
- `tests/golden/SUMMARY.md` is a readable table of the headline numbers.
- GitHub Actions runs `npm test` on every push and pull request (`.github/workflows/golden-tests.yml`).
- `node tests/golden.test.js --html some-copy.html` checks another copy of the app against the same snapshots.

## Roadmap

1. Orient and plan (done): this file, git repository.
2. Golden tests that lock in today's tax and simulation results (done).
3. Standalone page: proper HTML skeleton, self-hosted fonts and jsPDF, PDF saved as a normal browser download, and the Claude-only features (Ask about your plan, Explain these plans) removed for version 1 (Alex's decision, 2026-10-24).
4. PWA: manifest, icons, service worker for offline use, install prompt.
5. Netlify: `netlify.toml`, security headers (strict CSP with no outside connections), deploy from GitHub.
