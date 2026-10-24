import {active,save} from "../storage.js";
import {simulate} from "../engine/simulate.js";
import {mc,mcRun,okShare,pct,realRet,retYearOf} from "../engine/montecarlo.js";
import {clamp,clone,n} from "../engine/util.js";
import {START_YEAR} from "../engine/dates.js";
import {bothPhrase,isSingle,ppl} from "../engine/plan.js";
import {esc,full,money} from "./format.js";
import {buildForm} from "./form.js";
import {render} from "./results.js";
import {drawMC} from "./chart.js";
import {staleOpt} from "./optimizer.js";

/* market risk */
function renderStress(){
  const d=active().data, base=simulate(d), len=base.rows.length, r=realRet(d);
  const k0=clamp(retYearOf(d)-START_YEAR,0,Math.max(0,len-1));
  const rets=Array(80).fill(r); rets[k0]=-0.25;
  const st=simulate(d,rets), yr=START_YEAR+k0, el=document.getElementById("stress");
  const loss=base.estate-st.estate;
  el.innerHTML="<b>Stress test:</b> if markets drop 25% in "+yr+", your first full year after "+bothPhrase(d)+", "+
    (st.firstShort===null?"the money still lasts. Your estate would be about "+esc(money(loss))+" smaller.":"<span style=\"color:var(--bad)\">the money runs short in "+st.rows[st.firstShort].year+"</span>.");
}
let mcData=null;
async function runMC(){
  const d=clone(active().data), job=++mc.job, btn=document.getElementById("btnMC"); btn.disabled=true;
  const runs=await mcRun(d,500,job,f=>btn.textContent="Running… "+Math.round(f*100)+"%");
  if(!runs) return;
  btn.disabled=false; btn.textContent="Run again";
  const b=simulate(d).rows; mcData={runs,years:b.map(x=>x.year),ages:b.map(x=>x.ages[0])};
  showMC();
}

/* what would it take */
let solveJob=0, solveResult=null;
async function runSolve(){
  const lever=document.getElementById("solveLever").value, target=n(document.getElementById("solveTarget").value)/100;
  const d0=clone(active().data), job=++mc.job, btn=document.getElementById("btnSolve"), out=document.getElementById("solveOut");
  btn.disabled=true; out.innerHTML=""; solveResult=null;
  const N=200; let done=0, total=1;
  const prog=f=>btn.textContent="Working… "+Math.round((done+f)/total*100)+"%";
  const test=async c=>{const r=await mcRun(c,N,job,prog); done++; return r?okShare(r):null;};
  const fmtP=x=>Math.round(x*100)+"%";
  let html="", apply=null;
  if(lever==="spend"){
    total=8;
    const scaled=k=>{const c=clone(d0); c.house.spending=n(d0.house.spending)*k; c.house.spendingLater=n(d0.house.spendingLater)*k; return c;};
    let lo=0.4, hi=1.6;
    const top=await test(scaled(hi)); if(top===null) return;
    if(top>=target){ apply={spending:Math.round(n(d0.house.spending)*hi/500)*500,spendingLater:Math.round(n(d0.house.spendingLater)*hi/500)*500};
      html="You could spend at least "+full(apply.spending)+" a year ("+full(apply.spendingLater)+" later) and still reach "+fmtP(target)+". That's 60% more than now."; }
    else{
      for(let it=0;it<7;it++){const mid=(lo+hi)/2, p=await test(scaled(mid)); if(p===null) return; (p>=target)?lo=mid:hi=mid;}
      const sp=Math.floor(n(d0.house.spending)*lo/500)*500, sl=Math.floor(n(d0.house.spendingLater)*lo/500)*500;
      apply={spending:sp,spendingLater:sl};
      const diff=sp-n(d0.house.spending);
      html="To reach "+fmtP(target)+", spend about <b>"+full(sp)+"</b> a year, then "+full(sl)+" later. That's "+(diff<0?full(-diff)+" less":full(diff)+" more")+" than now.";
    }
  } else if(lever==="retire"){
    total=6; let found=null, last=0;
    for(let add=0;add<=5;add++){const c=clone(d0); c.people.forEach(p=>p.retireAge=n(p.retireAge)+add); const p=await test(c); if(p===null) return; last=p; if(p>=target){found={add,p};break;}}
    if(!found) html="Even retiring 5 years later only reaches "+fmtP(last)+". Combine this with lower spending.";
    else if(found.add===0) html="Your current retirement ages already reach "+fmtP(found.p)+".";
    else{ apply={retireAdd:found.add}; html="Working <b>"+found.add+" more year"+(found.add>1?"s":"")+"</b>"+(isSingle(d0)?"":" each")+" ("+ppl(d0).map(p=>esc(p.name)+" to "+(n(p.retireAge)+found.add)).join(", ")+") reaches "+fmtP(found.p)+"."; }
  } else {
    const opts=[["As you have it",c=>c],["CPP at 70",c=>{c.people.forEach(p=>p.cppStart=70);return c;}],["CPP and OAS at 70",c=>{c.people.forEach(p=>{p.cppStart=70;p.oasStart=70;});return c;}]];
    total=opts.length; const res=[];
    for(const [label,fn] of opts){const p=await test(fn(clone(d0))); if(p===null) return; res.push([label,p]);}
    const best=res.reduce((b,x)=>x[1]>b[1]?x:b,res[0]);
    html=res.map(x=>esc(x[0])+": <b>"+fmtP(x[1])+"</b>").join(" · ")+".";
    if(best!==res[0]){apply={gov:best[0]}; html+=" Delaying helps because each year of waiting raises these lifetime, inflation-protected pensions.";}
  }
  btn.disabled=false; btn.textContent="Find it";
  solveResult=apply;
  out.innerHTML=html+(apply?' <button class="btn" type="button" id="btnApply" style="margin-left:6px">Use this</button>':"");
  if(apply) document.getElementById("btnApply").onclick=applySolve;
}
function applySolve(){
  const a=solveResult, d=active().data; if(!a) return;
  if(a.spending!=null){d.house.spending=a.spending; d.house.spendingLater=a.spendingLater;}
  if(a.retireAdd) d.people.forEach(p=>p.retireAge=n(p.retireAge)+a.retireAdd);
  if(a.gov){d.people.forEach(p=>{p.cppStart=70; if(a.gov.includes("OAS")) p.oasStart=70;});}
  active().example=false; save(); buildForm(); render();
  document.getElementById("solveOut").textContent="Applied. Run the market histories to see the full picture.";
}
document.getElementById("btnSolve").onclick=runSolve;
function showMC(){
  if(!mcData) return;
  const {runs}=mcData, ok=runs.filter(x=>x.short===null).length, share=ok/runs.length;
  const g=document.getElementById("mcGauge"); g.className="gauge "+(share>=.85?"good":share>=.7?"warn":"bad");
  document.getElementById("mcPct").textContent=Math.round(share*100)+"%";
  const shorts=runs.filter(x=>x.short!==null).map(x=>x.short);
  const f=[["Median estate after tax",money(pct(runs.map(x=>x.estate),.5))],["Bad case estate (1 in 10)",money(pct(runs.map(x=>x.estate),.1))],
    [shorts.length?"When it runs short, the typical year":"Runs short in",shorts.length?String(pct(shorts,.5)):"No history"]];
  document.getElementById("mcFacts").innerHTML=f.map(x=>"<div><span class=\"num\">"+esc(x[1])+"</span><span>"+esc(x[0])+"</span></div>").join("");
  document.getElementById("mcOut").hidden=false;
  document.getElementById("mcNote").textContent=share>=.85?"Your plan holds up in most market histories.":share>=.7?"Your plan works in most histories but has little cushion. Lower spending, later retirement, or a later CPP start can raise this.":"Your plan depends on good markets. Consider lower spending, working longer, or delaying CPP and OAS.";
  drawMC();
}
document.getElementById("btnMC").onclick=runMC;
function staleMC(){ staleOpt(); const so=document.getElementById("solveOut"); if(so&&so.querySelector("#btnApply")){so.textContent="";solveResult=null;} if(mcData){mc.job++; mcData=null; document.getElementById("mcOut").hidden=true; const b=document.getElementById("btnMC"); b.disabled=false; b.textContent="Run 500 market histories"; document.getElementById("mcNote").textContent="Your numbers changed. Run the market histories again to update.";} }

export {mcData,renderStress,staleMC};
