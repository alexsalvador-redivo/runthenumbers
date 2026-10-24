import {TAX_DATA} from "../data/tax-data.js";
import {clamp,n} from "./util.js";

// Government figures (canada.ca, Oct–Dec 2026)
// Tax and benefit figures come from the Airtable base, synced into src/data/tax-data.json
const TD=TAX_DATA, B=TD.benefits;
const OAS_MAX_MONTHLY = B.oasMaxMonthly;   // ages 65–74; 75+ is 10% higher
const CPP_MAX_65 = B.cppMax65;
// CPP survivor's pension maximums (2026)
const SURV={under65:B.survUnder65,flat:B.survFlat,over65:B.survOver65,combined:B.survCombined,death:B.deathBenefit};
function survCppAnnual(own,dec,age){
  const D=n(dec.cpp65)*12;
  let s=age>=65?Math.min(.6*D,SURV.over65*12):Math.min(SURV.under65*12,.375*D+SURV.flat*12);
  if(own>0) s=Math.min(s,Math.max(0,SURV.combined*12-own));
  return s;
}

// RRIF minimum withdrawal factors, age at start of year (72+)
const RRIF = Object.fromEntries(Object.entries(TD.rrif).map(([a,f])=>[+a,f]));
// a = age reached this year; the factor uses age at January 1 (a-1). First minimum is in the year you turn 72.
const rrifFactor = a => a<72 ? 0 : (RRIF[Math.min(a-1,95)] ?? RRIF[95]);
function cppAnnual(p){
  const s = clamp(n(p.cppStart),60,70), m=(s-65)*12;
  const adj = m<0 ? 1+0.006*m : 1+0.007*m;
  return n(p.cpp65)*12*adj;
}
function oasAnnual(p, age){
  const yrs=n(p.oasYears); if(yrs<10) return 0;
  const s=clamp(n(p.oasStart),65,70);
  return OAS_MAX_MONTHLY*12*Math.min(yrs,40)/40*(1+0.006*Math.min(60,(s-65)*12))*(age>=75?1.1:1);
}

export {TD,B,OAS_MAX_MONTHLY,CPP_MAX_65,SURV,survCppAnnual,rrifFactor,cppAnnual,oasAnnual};
