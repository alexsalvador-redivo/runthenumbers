import {active,store} from "../storage.js";
import {simulate} from "../engine/simulate.js";
import {bothPhrase,isSingle,ppl} from "../engine/plan.js";
import {esc,full,money} from "./format.js";
import {clamp,clone,n} from "../engine/util.js";
import {drawChart} from "./chart.js";
import {renderStress,staleMC} from "./risk.js";
import {realRet,retYearOf} from "../engine/montecarlo.js";
import {START_YEAR} from "../engine/dates.js";

/* ---------- render ---------- */
let last=null;

function render(){
  const s=active(), d=s.data, res=simulate(d); last={res,d};
  const {rows,firstShort}=res, P=ppl(d);
  const names=P.map((p,i)=>p.name||("Spouse "+(i+1)));
  const v=document.getElementById("verdict"), big=document.getElementById("vBig"), txt=document.getElementById("vText");
  if(!rows.length){big.textContent="Check the birth years";txt.textContent="";v.className="verdict";return;}
  const endRow=rows[rows.length-1];
  if(firstShort===null){
    const li=endRow.alive.lastIndexOf(true)>=0?endRow.alive.lastIndexOf(true):0;
    v.className="verdict ok"; big.textContent="Yes, for the whole plan";
    txt.textContent="Your investments cover spending every year until "+endRow.year+", when "+names[li]+" is "+endRow.ages[li]+", with "+money(endRow.total)+" left over in today's dollars.";
  } else {
    const r=rows[firstShort], shortYears=rows.filter(x=>x.short>0).length, avg=rows.filter(x=>x.short>0).reduce((s,x)=>s+x.short,0)/shortYears;
    v.className="verdict short"; big.textContent="Runs short in "+r.year;
    txt.textContent="When "+names.map((nm,i)=>nm+" is "+r.ages[i]).join(" and ")+". After that, CPP, OAS and pensions fall about "+money(avg)+" a year short of spending"+(endRow.homeEq>0?", though you'd still have about "+money(endRow.homeEq)+" in home equity.":".");
  }
  const di=rows.findIndex(x=>!x.alive.every(Boolean));
  if(di>0){const b=rows[di-1],a=rows[di],inc=x=>x.cpp+x.oas+x.pen, dn=b.alive.findIndex((al,i)=>!a.alive[i]);
    txt.textContent+=" After "+names[dn]+" dies in "+b.year+", guaranteed income drops from "+money(inc(b))+" to "+money(inc(a))+" a year"+(a.avgRate>b.avgRate+0.005?" and the tax rate rises to "+(a.avgRate*100).toFixed(1)+"%":"")+".";}
  const clawTot=rows.reduce((s,x)=>s+x.claw,0);
  if(clawTot>0) txt.textContent+=" OAS clawback takes about "+money(clawTot)+" over the plan.";
  // stats
  const retYear=Math.max(...P.map(p=>n(p.birthYear)+n(p.retireAge)));
  const rr=rows.find(x=>x.year===retYear-1)||rows[0];
  document.getElementById("stRetireK").textContent="Investments when "+bothPhrase(d);
  document.getElementById("stRetire").textContent=money(rows.find(x=>x.year===retYear)?rr.total:rows[0].total);
  document.getElementById("stIncome").textContent=money(res.lifeTax);
  document.getElementById("stEnd").textContent=money(res.estate);
  document.getElementById("stEndK").textContent="Estate after tax, incl. "+money(endRow.homeEq)+" home"+(res.estateTax>0?" and "+money(res.estateTax)+" tax on the final RRIF":"");
  renderTakeaways(d,res);
  drawChart();
  renderStress(); staleMC();
  renderTable(rows,names);
  renderCompare();
}

function renderTable(rows,names){
  const cols=[["Year",x=>x.partial?x.year+" (rest)":x.year],[names.join(" / "),x=>x.ages.map((a,i)=>x.alive[i]?a:"–").join(" / ")],["CPP survivor",x=>full(x.survCpp)],
    ["Work pay",x=>full(x.work)],["CPP",x=>full(x.cpp)],["OAS",x=>full(x.oas)],["Pension",x=>full(x.pen)],
    ["RRIF min.",x=>full(x.rrifMin)],["Drawdown",x=>full(x.melt)],["Income tax",x=>full(-x.tax)],["OAS clawback",x=>full(-x.claw)],["Avg. rate",x=>x.totInc?(x.avgRate*100).toFixed(1)+"%":"–"],
    ["Pension split",x=>x.split?full(x.split)+" → "+names[1-x.splitFrom]:"–"],["CPP shared",x=>full(x.cppShared)],["CPP / EI premiums",x=>full(-x.payroll)],["Spending",x=>full(-x.spend)],["Mortgage",x=>full(-x.mortPay)],["Events",x=>full(x.evIn-x.evExp)],["Care",x=>full(-x.ltc)],["Saving",x=>full(-x.contrib)],
    ["From cash",x=>full(x.wd.cash)],["From non-reg",x=>full(x.wd.nonreg)],["From RRSP",x=>full(x.wd.rrsp)],["From TFSA",x=>full(x.wd.tfsa)],
    ["To TFSA",x=>full(x.tfsaIn)],["Shortfall",x=>full(-x.short)],["Investments",x=>full(x.total)],["Home equity",x=>full(x.homeEq)],["Notes",x=>x.events.join(", ")]];
  let h="<thead><tr>"+cols.map(c=>"<th>"+esc(c[0])+"</th>").join("")+"</tr></thead><tbody>";
  rows.forEach(x=>{h+="<tr class=\""+(x.short>0?"short":x.events.length?"event":"")+"\">"+cols.map(c=>"<td>"+esc(String(c[1](x)))+"</td>").join("")+"</tr>";});
  document.getElementById("tbl").innerHTML=h+"</tbody>";
}

function renderCompare(){
  const panel=document.getElementById("comparePanel"), box=document.getElementById("compare");
  if(store.scenarios.length<2){panel.hidden=true;return;}
  panel.hidden=false; box.innerHTML="";
  store.scenarios.forEach(s=>{
    const r=simulate(s.data), e=r.rows[r.rows.length-1]||{total:0,homeEq:0};
    const row=document.createElement("div"); row.className="crow";
    const nm=document.createElement("span"); nm.textContent=s.name+(s.id===store.active?" (open)":""); nm.style.fontWeight=s.id===store.active?"700":"400";
    const pill=document.createElement("span");
    if(r.firstShort===null){pill.className="pill ok";pill.textContent="Lasts";}
    else{pill.className="pill short";pill.textContent="Short in "+r.rows[r.firstShort].year;}
    const end=document.createElement("span"); end.className="num"; end.style.fontSize="13px"; end.textContent=money(r.lifeTax)+" tax · "+money(r.estate)+" estate";
    row.append(nm,pill,end); box.appendChild(row);
  });
}

// Plain-language takeaways: income picture, biggest risk, biggest lever
function takeaways(d,res){
  const rows=res.rows, P=ppl(d), names=P.map(p=>p.name), single=isSingle(d), out=[];
  if(!rows.length) return out;
  const we=single?"you":"you both", your="your";
  // 1. income picture, once government pensions have started
  const startAge=P.map(p=>Math.max(clamp(n(p.cppStart),60,70),clamp(n(p.oasStart),65,70),n(p.retireAge)));
  const ri=rows.find(r=>!r.partial&&r.alive.every(Boolean)&&r.ages.every((a,i)=>a>=startAge[i]));
  if(ri){ const g=ri.cpp+ri.oas+ri.pen, need=ri.spend+ri.mortPay, pc=need>0?Math.round(g/need*100):0;
    out.push({k:"Income",t:"From "+ri.year+", CPP, OAS"+(ri.pen>0?" and "+your+" workplace pension":"")+" pay about "+money(g)+" a year, before tax. That covers roughly "+Math.min(pc,999)+"% of "+your+" spending"+(pc<100?"; "+your+" savings make up the rest.":", so "+your+" savings are mostly a cushion.")}); }
  // 2. biggest risk
  const r0=realRet(d), k0=clamp(retYearOf(d)-START_YEAR,0,Math.max(0,rows.length-1)), rets=Array(80).fill(r0); rets[k0]=-0.25;
  const st=simulate(d,rets), endRow=rows[rows.length-1];
  const di=rows.findIndex(x=>!x.alive.every(Boolean));
  const clawTot=res.lifeClaw;
  if(res.firstShort!==null){
    const r=rows[res.firstShort]; out.push({k:"Risk",t:"Spending is higher than "+your+" savings and pensions can support. The money runs short in "+r.year+", when "+names.map((nm,i)=>(single?"you are ":nm+" is ")+r.ages[i]).join(" and ")+"."});
  } else if(st.firstShort!==null){
    out.push({k:"Risk",t:"A market drop early in retirement. If markets fell 25% in "+(START_YEAR+k0)+", the money would run short in "+st.rows[st.firstShort].year+". Keeping a cash cushion, or being ready to trim spending, protects against this."});
  } else if(!single&&di>0){
    const b=rows[di-1],a=rows[di],inc=x=>x.cpp+x.oas+x.pen, drop=1-inc(a)/Math.max(1,inc(b)), dn=b.alive.findIndex((al,i)=>!a.alive[i]);
    out.push({k:"Risk",t:"Losing a spouse. When "+names[dn]+" dies, guaranteed income falls about "+Math.round(drop*100)+"%, from "+money(inc(b))+" to "+money(inc(a))+" a year, while many costs stay the same."});
  } else if(clawTot>0){
    out.push({k:"Risk",t:"OAS clawback. Higher income later in life costs about "+money(clawTot)+" of OAS over the plan. Drawing RRSP money earlier can reduce it."});
  } else if(res.estateTax>50000){
    out.push({k:"Risk",t:"Tax at the end. About "+money(res.estateTax)+" of the RRIF left at the end would be taxed in one final return."});
  } else out.push({k:"Risk",t:"No major weak spots in the steady projection. Run the market histories below to see how it holds up in rough markets."});
  // 3. biggest lever (quick deterministic tests)
  const tests=[];
  if(P.some(p=>n(p.cppStart)<70||n(p.oasStart)<70)) tests.push(["Delaying CPP and OAS to 70",x=>ppl(x).forEach(p=>{p.cppStart=70;p.oasStart=70;})]);
  if(!n(d.assume.meltTarget)&&P.reduce((s,p)=>s+n(p.rrsp),0)>100000) tests.push(["Drawing "+(single?"your":"each")+" RRSP up to $55,000 a year after retiring",x=>{x.assume.meltTarget=55000;}]);
  if(!single&&d.assume.cppShare!=="yes") tests.push(["Sharing CPP between you",x=>{x.assume.cppShare="yes";}]);
  if(res.firstShort!==null){ tests.push(["Spending 10% less",x=>{x.house.spending=n(x.house.spending)*.9;x.house.spendingLater=n(x.house.spendingLater)*.9;}]);
    tests.push(["Working one more year",x=>ppl(x).forEach(p=>p.retireAge=n(p.retireAge)+1)]); }
  let best=null;
  tests.forEach(([label,fn])=>{const x=clone(d); fn(x); const r=simulate(x);
    const score=res.firstShort!==null?(r.firstShort===null?1e9:r.rows[r.firstShort].year-rows[res.firstShort].year)*1e6+(r.estate-res.estate):r.estate-res.estate;
    if(!best||score>best.score) best={label,score,r};});
  if(best&&best.score>10000){
    const r=best.r;
    const what=res.firstShort!==null?(r.firstShort===null?"makes the money last for the whole plan":"pushes the shortfall back to "+r.rows[r.firstShort].year):"adds about "+money(r.estate-res.estate)+" to "+your+" estate after tax"+(r.lifeTax<res.lifeTax-5000?" and cuts lifetime tax by "+money(res.lifeTax-r.lifeTax):"");
    out.push({k:"Best lever",t:best.label+" "+what+". Try “Find my best plan” to test combinations."});
  } else out.push({k:"Best lever",t:"Your settings are already close to the best of the simple changes we tested. “Find my best plan” can test combinations."});
  return out;
}
function renderTakeaways(d,res){
  const ul=document.getElementById("takeaways"), items=takeaways(d,res);
  ul.innerHTML=items.map(x=>"<li><b>"+esc(x.k)+".</b> "+esc(x.t)+"</li>").join("");
}

export {render,last,takeaways,renderCompare};
