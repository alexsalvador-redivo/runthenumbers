import {ORDERS,isSingle,ppl} from "../engine/plan.js";
import {clamp,clone,n} from "../engine/util.js";
import {mc,mcRun,okShare} from "../engine/montecarlo.js";
import {active,save,store} from "../storage.js";
import {simulate} from "../engine/simulate.js";
import {esc,full,money,tick} from "./format.js";
import {buildForm} from "./form.js";
import {render} from "./results.js";
import {renderTabs} from "./scenarios.js";

/* ---------- plan optimizer ---------- */
let optHold=false;
function staleOpt(){ if(!optHold&&typeof optPlans!=="undefined"&&optPlans&&!optRunning){ optPlans=null; document.getElementById("optOut").innerHTML=""; document.getElementById("optStatus").textContent="Your numbers changed. Run it again for updated plans."; } }
const OPT_GOALS={spend:"Spend the most",retire:"Retire earliest",estate:"Leave the most",tax:"Pay the least tax"};
const optEl={goal:document.getElementById("optGoal"),target:document.getElementById("optTarget"),btn:document.getElementById("btnOpt"),
  out:document.getElementById("optOut"),status:document.getElementById("optStatus")};
let optPlans=null, optMeta=null, optRunning=false;
function combos(){const out=[]; for(const cpp of [65,67,70]) for(const oas of [65,70]) for(const melt of [0,40000,55000,70000]) for(const order of ORDERS.map(o=>o[0])) out.push({cpp,oas,melt,order}); return out;}
function withCombo(d,c,extra){const x=clone(d); x.people.forEach(p=>{p.cppStart=c.cpp;p.oasStart=c.oas;}); x.assume.meltTarget=c.melt; x.assume.meltEnd=x.assume.meltEnd||71; x.assume.order=c.order; x.assume.split="yes"; if(extra) extra(x); return x;}
// Keep finalists varied: at most one per CPP/OAS timing pair
function distinct(list,k){const seen=new Set(), out=[]; for(const x of list){const key=x.c.cpp+"/"+x.c.oas; if(seen.has(key))continue; seen.add(key); out.push(x); if(out.length>=k)break;} return out;}
async function pctOK(d,N,job){const runs=await mcRun(d,N,job); if(!runs) throw "stopped"; return okShare(runs);}
function optStatus(t){optEl.status.textContent=t;}
async function runOptimizer(){
  if(optRunning) return; optRunning=true;
  const goal=optEl.goal.value, target=clamp(n(optEl.target.value),50,99)/100, d0=clone(active().data), job=++mc.job, CS=combos();
  optEl.btn.disabled=true; optEl.out.innerHTML=""; optPlans=null;
  const N=150, plans=[];
  try{
    optStatus("Checking your current plan…");
    const curPct=await pctOK(d0,N,job), curRes=simulate(d0);
    const screen=async(extra,label)=>{const out=[]; for(let i=0;i<CS.length;i++){const x=withCombo(d0,CS[i],extra), r=simulate(x); out.push({c:CS[i],d:x,lasts:r.firstShort===null,estate:r.estate,tax:r.lifeTax}); if(i%12===11){optStatus(label+" "+Math.round(i/CS.length*100)+"%"); await tick();}} return out;};
    if(goal==="estate"||goal==="tax"){
      const sc=await screen(null,"Screening "+CS.length+" combinations…");
      sc.sort((a,b)=>(b.lasts-a.lasts)||(goal==="estate"?b.estate-a.estate:a.tax-b.tax));
      const top=distinct(sc,6);
      for(let i=0;i<top.length;i++){optStatus("Testing finalists against market histories ("+(i+1)+" of "+top.length+")…"); top[i].pct=await pctOK(top[i].d,N,job);}
      const ok=top.filter(p=>p.pct>=target), pool=ok.length?ok:top.slice().sort((a,b)=>b.pct-a.pct);
      if(ok.length) pool.sort((a,b)=>goal==="estate"?b.estate-a.estate:a.tax-b.tax);
      pool.slice(0,3).forEach(p=>plans.push({c:p.c,d:p.d,pct:p.pct,estate:p.estate,tax:p.tax,meets:p.pct>=target}));
    } else if(goal==="spend"){
      const base=n(d0.house.spending), later=n(d0.house.spendingLater);
      const scaleFn=k=>x=>{x.house.spending=base*k; x.house.spendingLater=later*k;};
      const det=[];
      for(let i=0;i<CS.length;i++){
        let lo=0.4,hi=2.5; for(let it=0;it<9;it++){const m=(lo+hi)/2; (simulate(withCombo(d0,CS[i],scaleFn(m))).firstShort===null)?lo=m:hi=m;}
        det.push({c:CS[i],k:lo}); if(i%6===5){optStatus("Screening "+CS.length+" combinations… "+Math.round(i/CS.length*100)+"%"); await tick();}
      }
      det.sort((a,b)=>b.k-a.k);
      const top=distinct(det,3);
      for(let i=0;i<top.length;i++){
        let lo=0.3,hi=top[i].k;
        for(let it=0;it<6;it++){optStatus("Finding the safe spending level for finalist "+(i+1)+" of 3 (step "+(it+1)+" of 6)…"); const m=(lo+hi)/2; (await pctOK(withCombo(d0,top[i].c,scaleFn(m)),120,job)>=target)?lo=m:hi=m;}
        const k=Math.floor(base*lo/500)*500/(base||1), x=withCombo(d0,top[i].c,scaleFn(k)), r=simulate(x);
        plans.push({c:top[i].c,d:x,pct:await pctOK(x,N,job),estate:r.estate,tax:r.lifeTax,spend:base*k,spendLater:later*k,meets:true});
      }
      plans.sort((a,b)=>b.spend-a.spend);
    } else {
      const minShift=Math.max(-8,...ppl(d0).map(p=>50-n(p.retireAge)));
      let found=null;
      for(let s=minShift;s<=5&&!found;s++){
        const shift=x=>x.people.forEach(p=>p.retireAge=n(p.retireAge)+s);
        const sc=await screen(shift,"Trying retirement "+(s<0?-s+" years earlier":s>0?s+" years later":"at your current ages")+"…");
        sc.sort((a,b)=>(b.lasts-a.lasts)||b.estate-a.estate);
        if(!sc[0].lasts) continue;
        for(const p of sc.slice(0,2)){p.pct=await pctOK(p.d,N,job); if(p.pct>=target){found=s; plans.push({c:p.c,d:p.d,pct:p.pct,estate:p.estate,tax:p.tax,shift:s,meets:true});}}
        if(found!==null){ const s2=s+1; if(s2<=5){const sh2=x=>x.people.forEach(p=>p.retireAge=n(p.retireAge)+s2); const b=(await screen(sh2,"Checking one more year for cushion…")).sort((a,b)=>(b.lasts-a.lasts)||b.estate-a.estate)[0]; b.pct=await pctOK(b.d,N,job); plans.push({c:b.c,d:b.d,pct:b.pct,estate:b.estate,tax:b.tax,shift:s2,meets:b.pct>=target});} }
      }
      if(found===null) optStatus("");
    }
    optMeta={goal,target,curPct,curEstate:curRes.estate,curTax:curRes.lifeTax,base:d0};
    optPlans=plans.slice(0,3);
    renderOpt();
  }catch(e){ if(e!=="stopped") throw e; optStatus("Stopped because the numbers changed. Run it again."); }
  finally{ optRunning=false; optEl.btn.disabled=false; }
}
function describeCombo(p,d0){
  const items=[]; const p0=d0.people[0], a0=d0.assume;
  const lab=o=>(ORDERS.find(x=>x[0]===o)||[,o])[1];
  if(p.shift!=null) items.push(p.shift===0?"Retire at your current age"+(isSingle(d0)?"":"s"):"Retire "+Math.abs(p.shift)+" year"+(Math.abs(p.shift)>1?"s":"")+" "+(p.shift<0?"earlier":"later")+" ("+ppl(d0).map(q=>q.name+" "+(n(q.retireAge)+p.shift)).join(", ")+")");
  if(p.spend!=null) items.push("Spend "+full(p.spend)+" a year"+(n(d0.house.spendingChangeAge)>0?", then "+full(p.spendLater):""));
  items.push("CPP at "+p.c.cpp+(p0.cppStart==p.c.cpp?" (as now)":""));
  items.push("OAS at "+p.c.oas+(p0.oasStart==p.c.oas?" (as now)":""));
  items.push(p.c.melt?"Draw RRSP up to "+full(p.c.melt)+" a year each after retiring":"No extra RRSP drawdown");
  items.push("Withdraw "+lab(p.c.order)+(a0.order===p.c.order?" (as now)":""));
  return items;
}
function renderOpt(){
  const m=optMeta, out=optEl.out; out.innerHTML="";
  const goalName=OPT_GOALS[m.goal].toLowerCase();
  optStatus("Your current plan: money lasts in "+Math.round(m.curPct*100)+"% of market histories, "+money(m.curEstate)+" estate after tax.");
  if(optPlans.length&&!optPlans.some(p=>p.meets)) optEl.status.textContent+=" None of the combinations reach your target, so these are the closest. Try the \"Spend the most\" goal to see what spending would get you there.";
  if(!optPlans.length){out.innerHTML='<p class="note">No combination reached '+Math.round(m.target*100)+'%. Try a lower target, or lower spending first.</p>'; return;}
  optPlans.forEach((p,i)=>{
    const card=document.createElement("div"); card.className="opt-card"+(i===0?" best":"");
    const pc=Math.round(p.pct*100), cls=p.pct>=.85?"ok":p.pct>=.7?"warn":"short";
    card.innerHTML='<div class="opt-head"><b>'+(i===0?"Best plan":"Option "+String.fromCharCode(65+i))+'</b><span class="pill '+cls+'">'+pc+'% lasts</span></div>'+
      '<ul>'+describeCombo(p,m.base).map(t=>"<li>"+esc(t)+"</li>").join("")+'</ul>'+
      '<div class="opt-metrics num"><span>Estate after tax <b>'+esc(money(p.estate))+'</b></span><span>Lifetime tax <b>'+esc(money(p.tax))+'</b></span></div>'+
      (p.meets?"":'<p class="note" style="margin:4px 0 0">Doesn\'t reach your '+Math.round(m.target*100)+'% target, but it\'s the closest found.</p>');
    const row=document.createElement("div"); row.className="actions"; row.style.marginTop="8px";
    const ap=document.createElement("button"); ap.type="button"; ap.className="btn"+(i===0?" primary":""); ap.textContent="Apply";
    const sv=document.createElement("button"); sv.type="button"; sv.className="btn"; sv.textContent="Save as scenario";
    ap.onclick=()=>{ active().data=clone(p.d); active().example=false; save(); optHold=true; buildForm(); render(); optHold=false; card.querySelector(".actions").innerHTML='<span class="muted">Applied to '+esc(active().name)+'.</span>'; };
    sv.onclick=()=>{ const id="s"+Date.now(); store.scenarios.push({id,name:(i===0?"Best: ":"")+OPT_GOALS[m.goal],example:false,data:clone(p.d)}); store.active=id; save(); optHold=true; renderTabs(); buildForm(); render(); optHold=false; sv.replaceWith(Object.assign(document.createElement("span"),{className:"muted",textContent:"Saved as a new scenario."})); };
    row.append(ap,sv); card.appendChild(row); out.appendChild(card);
  });
}
optEl.btn.onclick=runOptimizer;

export {staleOpt};
