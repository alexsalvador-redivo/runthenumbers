// Test-only: hands the engine to the golden tests (tests/harness.js) as window.__RTN.
// Built only with `vite build --mode golden`; the published app never includes this file.
import {TAX_DATA} from "./data/tax-data.js";
import {START_YEAR,F0} from "./engine/dates.js";
import {clone} from "./engine/util.js";
import {EXAMPLE} from "./engine/plan.js";
import {survCppAnnual,rrifFactor,cppAnnual,oasAnnual} from "./engine/benefits.js";
import {PROV,onHealth,bracketTax,payroll,personTax,houseTax,setPV} from "./engine/tax.js";
import {simulate,findTargets} from "./engine/simulate.js";
import {mc,mcRun,quickMC} from "./engine/montecarlo.js";
import {validStore,migrate} from "./storage.js";

window.__RTN={
  START_YEAR, F0, EXAMPLE:clone(EXAMPLE), PROV_CODES:Object.keys(PROV),
  simulate, findTargets, quickMC, mcRun:(d,N)=>mcRun(d,N,mc.job),
  personTax:(code,o)=>{setPV(PROV[code]); return personTax(o);},
  houseTax:(code,base,w,s)=>{setPV(PROV[code]); return houseTax(base,w,s);},
  payroll, cppAnnual, oasAnnual, survCppAnnual, rrifFactor, onHealth, bracketTax,
  validStore, migrate, clone,
  // The tax data exactly as the app uses it, with Infinity spelled out so it survives JSON
  taxDataJson:JSON.stringify(TAX_DATA,(k,v)=>v===Infinity?"__INF__":v),
};
