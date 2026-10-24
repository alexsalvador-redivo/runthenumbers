import {PROV} from "../engine/tax.js";
import {COUPLE_ONLY,ORDERS,isSingle,ppl} from "../engine/plan.js";
import {active,save} from "../storage.js";
import {ASSUME_FIELDS,HOUSE_FIELDS,PEOPLE_FIELDS} from "./fields.js";
import {render} from "./results.js";
import {n} from "../engine/util.js";

/* ---------- form ---------- */
function inputFor(id,type,val){
  const wrap=document.createElement("div");
  wrap.className="field"+(type==="$"?" money":type==="%"?" pct":"");
  let el;
  if(type==="prov"){
    el=document.createElement("select");
    Object.entries(PROV).sort((a,b)=>a[1].name.localeCompare(b[1].name)).forEach(([v,o])=>{const op=document.createElement("option");op.value=v;op.textContent=o.name;el.appendChild(op);});
    el.value=val||"BC";
  } else if(type==="yesno"){
    el=document.createElement("select");
    [["yes","Yes"],["no","No"]].forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;el.appendChild(o);});
    el.value=val;
  } else if(type==="select"){
    el=document.createElement("select");
    ORDERS.forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;el.appendChild(o);});
    el.value=val;
  } else {
    el=document.createElement("input");
    if(type==="text"){el.type="text";}
    else{el.type="number";el.inputMode="decimal";el.step=type==="%"?"0.1":type==="int"?"1":"1000";el.min="0";}
    el.value=val;
  }
  el.id=id; wrap.appendChild(el); return wrap;
}
// Plain-language help for every input, shown from the ? buttons
const HELP={
  mode:"Choose “Just me” to plan for one person. Couple-only features like pension splitting, CPP sharing and survivor benefits are hidden.",
  name:"Used to label the results, chart and table.",
  birthYear:"Ages come from birth year. CPP, OAS, RRIF minimums and the age credit all start at set ages, so this matters.",
  retireAge:"The age you stop working. Salary and savings contributions stop at the start of that year.",
  lifeAge:"How long to plan for. Many planners use 95, since running out late is worse than leaving money behind. For a couple, try a shorter age for one spouse to see how the survivor manages.",
  salary:"Pay before tax, per year, until you retire. The calculator works out income tax, CPP and EI from it. Self-employed? Use your net business income.",
  rrsp:"Today's balance in RRSPs, RRIFs, spousal RRSPs, LIRAs and LIFs owned by this person, and defined contribution pension accounts. Every dollar withdrawn is taxable. An RRSP must become a RRIF by the end of the year you turn 71.",
  tfsa:"Today's TFSA balance. Growth and withdrawals are tax-free and don't affect OAS or other benefits.",
  nonreg:"Taxable investment accounts outside RRSPs and TFSAs. Tax on their growth and capital gains isn't calculated yet, so results here are slightly optimistic.",
  rrspContrib:"What this person adds to their RRSP each year until retiring. Contributions lower taxable income.",
  tfsaContrib:"What this person adds to their TFSA each year until retiring.",
  tfsaRoom:"Unused TFSA room today, from CRA My Account. It already includes this year's $7,000. Extra RRIF or drawdown money goes here before a taxable account.",
  pension:"A defined benefit (workplace) pension: the yearly amount before tax, in today's dollars. Your annual pension statement shows it. Assumed to rise with inflation. If you have a defined contribution plan, add its balance to the RRSP field instead.",
  pensionStart:"The age the workplace pension begins. Often the same as retirement, but check your plan for reductions before its normal age.",
  survPct:"How much of this pension continues to a surviving spouse. 60% is a common joint-and-survivor option; your pension statement says which you have.",
  cpp65:"Your CPP (or QPP in Quebec) at 65, per month. Find it in your Statement of Contributions in My Service Canada Account. The 2026 maximum is $1,507.65; most people get noticeably less.",
  cppStart:"Any age from 60 to 70. Each month before 65 cuts the pension 0.6% (36% less at 60). Each month after 65 adds 0.7% (42% more at 70). It's paid for life and rises with inflation, so waiting is a hedge against living long.",
  oasYears:"Years lived in Canada after age 18. At least 10 qualifies for some OAS; 40 gets the full amount.",
  oasStart:"Any age from 65 to 70. Each month you wait adds 0.6% (36% more at 70). OAS rises another 10% at 75. It's reduced by 15% of net income above $95,323 (2026), the OAS clawback.",
  province:"Sets provincial tax rates and credits. Choose where you expect to live in retirement.",
  spending:"What you'll spend each year in retirement after tax, in today's dollars. Leave out mortgage payments, big expenses and care costs, which have their own fields. A common starting point is about 70% of what you spend now.",
  spendingLater:"Many people spend less in their late 70s and 80s as travel and activities slow down. Set the same as above to keep spending flat.",
  spendingChangeAge:"The age, of the first person listed, when spending switches to the later amount. 0 keeps spending the same throughout.",
  survivorSpend:"After a spouse dies, spending usually drops, but not by half, since housing and many costs stay the same. 70% is a common assumption.",
  cash:"Chequing, savings accounts and GICs. Earns the cash return, and doesn't drop in market crashes.",
  homeValue:"Today's value of your home. It counts toward your estate but isn't spent unless you downsize.",
  mortgage:"What you still owe on your mortgage or HELOC today.",
  mortgageRate:"The interest rate on that balance.",
  mortgagePayment:"Your total payments per year (monthly payment × 12). Payments continue until the balance is paid off.",
  downsizeAge:"The age, of the first person listed, when you sell and move somewhere cheaper. 0 means you stay put.",
  downsizeAmount:"Cash freed up by downsizing, after selling costs and buying the new place, in today's dollars. Any mortgage is paid off first; the rest is invested.",
  ltcCost:"Yearly cost per person for care at home, assisted living or long-term care, on top of regular spending. Private care can cost several thousand dollars a month; check rates where you live. 0 turns it off.",
  ltcAge:"The age care costs start, for each person separately.",
  returnRate:"Average yearly return on investments, before inflation, after fees. 5% to 6% is a common assumption for a balanced portfolio. If you pay 1.5% in fees, subtract it.",
  cashRate:"Yearly interest on cash, before inflation. Check what your savings account or GICs pay.",
  inflation:"How fast prices rise each year. The Bank of Canada targets 2%; 2.5% adds a margin. Results are shown in today's dollars.",
  volatility:"How much returns swing from year to year, used by the stress test and market histories. About 10% for a balanced portfolio, 15% for mostly stocks, 6% for mostly bonds.",
  flexCut:"In retirement, spend this much less in the year after markets fall. Being willing to tighten your belt in bad years makes a plan much more resilient. 0 turns it off.",
  split:"Couples can move up to half of eligible pension income to the lower-income spouse's tax return: workplace pensions at any age, RRIF income from 65. The calculator picks the best split each year.",
  cppShare:"Spouses 60 or older who both collect CPP can share the part earned while together. It can lower tax when one CPP is much bigger. If pension splitting already evens out your incomes, it adds little.",
  cppShareYears:"The share of your working years you were together. Only CPP earned while together is shared.",
  order:"Which accounts to draw from first when income doesn't cover spending. Cash and taxable accounts first is a common default; the optimizer can test the others.",
  meltTarget:"Draws RRSP money each year after retiring until taxable income reaches this level, and moves what you don't spend into your TFSA. It fills low tax brackets before CPP and OAS start and shrinks RRIF minimums later. Try the RRSP drawdown finder to choose a level.",
  meltEnd:"The last age for the planned drawdown. From 72, RRIF minimum withdrawals take over.",
  events:"Big one-time or repeating costs (a car, a roof, helping family) and money coming in (an inheritance, part-time work). Ages follow the first person listed."
};
function helpBtn(key,label){
  if(!HELP[key]) return null;
  const b=document.createElement("button"); b.type="button"; b.className="help-btn"; b.textContent="?";
  b.setAttribute("aria-label","What is "+label+"?"); b.setAttribute("aria-expanded","false"); b.dataset.help=key;
  return b;
}
document.addEventListener("click",e=>{
  const b=e.target.closest(".help-btn"); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const host=b.closest("label")||b.parentElement; let pop=host.querySelector(".help-pop");
  if(pop){pop.remove(); b.setAttribute("aria-expanded","false"); return;}
  pop=document.createElement("span"); pop.className="help-pop"; pop.setAttribute("role","note"); pop.textContent=HELP[b.dataset.help];
  host.appendChild(pop); b.setAttribute("aria-expanded","true");
});

function labelFor(id,text,hint,names,key){
  const l=document.createElement("label"); l.htmlFor=id; l.textContent=text;
  const hb=helpBtn(key,text); if(hb){l.append(" ",hb);}
  if(hint){const s=document.createElement("small"); s.textContent=hint.replace("@0", names?("of "+names[0]):""); l.appendChild(s);}
  return l;
}
function buildForm(){
  const d=active().data;
  const pg=document.getElementById("peopleGrid"); pg.innerHTML=""; const single=isSingle(d), PP=ppl(d);
  pg.className="pair"+(single?" one":"");
  document.getElementById("hhMode").value=single?"single":"couple";
  document.querySelector("#fsPeople legend").textContent=single?"You":"The two of you";
  const h0=document.createElement("div");h0.className="colh blank";pg.appendChild(h0);
  PP.forEach((p,i)=>{const h=document.createElement("div");h.className="colh";h.id="colh"+i;h.textContent=p.name||("Spouse "+(i+1));pg.appendChild(h);});
  PEOPLE_FIELDS.forEach(f=>{
    if(f[0]==="g"){const g=document.createElement("div");g.className="group-label";g.textContent=f[1];pg.appendChild(g);return;}
    const [key,label,type,hint]=f;
    if(single&&COUPLE_ONLY.has(key)) return;
    pg.appendChild(labelFor("p0_"+key,label,hint,null,key));
    PP.forEach((p,i)=>{
      const w=inputFor("p"+i+"_"+key,type,p[key]);
      if(i===1) w.querySelector("input,select").setAttribute("aria-label",label+" for "+(p.name||"Spouse 2"));
      pg.appendChild(w);
    });
  });
  const names=d.people.map(p=>p.name);
  [["houseGrid",HOUSE_FIELDS,"h_",d.house],["assumeGrid",ASSUME_FIELDS,"a_",d.assume]].forEach(([gid,fields,pre,obj])=>{
    const g=document.getElementById(gid); g.innerHTML="";
    fields.forEach(f=>{
      if(f[0]==="g"){const x=document.createElement("div");x.className="group-label";x.textContent=f[1];g.appendChild(x);return;}
      const [key,label,type,hint]=f;
      if(single&&COUPLE_ONLY.has(key)) return;
      g.appendChild(labelFor(pre+key,label,hint,names,key));
      g.appendChild(inputFor(pre+key,type,obj[key]));
    });
  });
  buildEvents();
  document.getElementById("scenName").value=active().name;
  document.getElementById("exampleNote").hidden=!active().example;
}
const EV_KINDS=[["expense","Expense"],["income","Taxable income (e.g. part-time work)"],["free","Tax-free money in (e.g. inheritance)"]];
function buildEvents(){
  const d=active().data, L=document.getElementById("evList"); L.innerHTML="";
  document.getElementById("evHint").textContent="One-time or repeating costs and money coming in, timed by "+(d.people[0].name||"Spouse 1")+"'s age. Today's dollars.";
  const mk=(i,key,type,val,opts)=>{const w=document.createElement("div"); w.className="field"+(type==="$"?" money":"");
    let el; if(opts){el=document.createElement("select"); opts.forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;el.appendChild(o);}); el.value=val;}
    else{el=document.createElement("input"); el.type=type==="text"?"text":"number"; if(type!=="text"){el.inputMode="decimal";el.min="0";el.step=type==="$"?"1000":"1";} el.value=val;}
    el.id="ev"+i+"_"+key; el.dataset.ev=i; el.dataset.k=key; w.appendChild(el); return w;};
  const lab=(text,fieldEl,cls)=>{const l=document.createElement("label"); if(cls)l.className=cls; l.htmlFor=fieldEl.firstChild.id; l.append(text,fieldEl); return l;};
  d.house.events.forEach((e,i)=>{
    const row=document.createElement("div"); row.className="ev";
    const top=document.createElement("div"); top.className="full";
    const nm=lab("What",mk(i,"label","text",e.label||"")); nm.style.flex="1";
    const rm=document.createElement("button"); rm.type="button"; rm.className="rm"; rm.textContent="Remove"; rm.dataset.rm=i; rm.setAttribute("aria-label","Remove "+(e.label||"event"));
    top.append(nm,rm); row.appendChild(top);
    row.appendChild(lab("Type",mk(i,"kind","",e.kind||"expense",EV_KINDS),"wide"));
    row.appendChild(lab("Amount",mk(i,"amount","$",e.amount||0),"wide"));
    row.appendChild(lab("At age",mk(i,"age","int",e.age||0)));
    row.appendChild(lab("Repeat every (yrs)",mk(i,"every","int",e.every||0)));
    row.appendChild(lab("Until age",mk(i,"until","int",e.until||0)));
    const who=lab("Whose income",mk(i,"who","",String(e.who||"0"),ppl(d).map((p,j)=>[String(j),p.name||("Spouse "+(j+1))])));
    who.hidden=e.kind!=="income"||isSingle(d); row.appendChild(who);
    L.appendChild(row);
  });
  if(!d.house.events.length){const p=document.createElement("p"); p.className="fhint"; p.style.margin="0"; p.textContent="No events yet. Add a car, a renovation, help for family, an inheritance, or part-time work."; L.appendChild(p);}
}
document.getElementById("hhMode").addEventListener("change",e=>{ e.stopPropagation(); readForm(); active().data.house.mode=e.target.value; active().example=false; save(); buildForm(); render(); });
document.getElementById("btnAddEv").onclick=()=>{const d=active().data; const a0=new Date().getFullYear()+1-n(d.people[0].birthYear);
  d.house.events.push({label:"",kind:"expense",amount:10000,age:Math.max(a0,n(d.people[0].retireAge)),every:0,until:0,who:"0"});
  active().example=false; save(); buildEvents(); render(); const ins=document.querySelectorAll("#evList input[data-k=label]"); ins[ins.length-1].focus();};
document.getElementById("evList").addEventListener("click",e=>{const b=e.target.closest("button[data-rm]"); if(!b)return;
  active().data.house.events.splice(+b.dataset.rm,1); active().example=false; save(); buildEvents(); render();});
function readForm(){
  const s=active(), d=s.data;
  d.people.forEach((p,i)=>PEOPLE_FIELDS.forEach(f=>{ if(f[0]==="g")return; const el=document.getElementById("p"+i+"_"+f[0]); if(el) p[f[0]]=f[2]==="text"?el.value:(el.value===""?0:+el.value); }));
  HOUSE_FIELDS.forEach(f=>{ if(f[0]==="g")return; const el=document.getElementById("h_"+f[0]); if(!el)return; d.house[f[0]]=f[2]==="prov"?el.value:(el.value===""?0:+el.value); });
  ASSUME_FIELDS.forEach(f=>{ if(f[0]==="g")return; const el=document.getElementById("a_"+f[0]); if(!el)return; d.assume[f[0]]=(f[2]==="select"||f[2]==="yesno")?el.value:(el.value===""?0:+el.value); });
  d.people.forEach((p,i)=>{const h=document.getElementById("colh"+i); if(h) h.textContent=p.name||("Spouse "+(i+1));});
  document.querySelectorAll("#evList [data-ev]").forEach(el=>{const e=d.house.events[+el.dataset.ev]; if(!e)return; const k=el.dataset.k;
    e[k]=(k==="label"||k==="kind"||k==="who")?el.value:(el.value===""?0:+el.value);
    if(k==="kind"){const w=document.getElementById("ev"+el.dataset.ev+"_who"); if(w) w.closest("label").hidden=el.value!=="income";}});
}

export {buildForm,readForm};
