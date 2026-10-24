import {PAY,PROV,TFSA_ROOM} from "../engine/tax.js";
import {clamp,clone,n} from "../engine/util.js";
import {EXAMPLE} from "../engine/plan.js";
import {CPP_MAX_65} from "../engine/benefits.js";
import {save,store} from "../storage.js";
import {drawChart} from "./chart.js";
import {renderTabs} from "./scenarios.js";
import {buildForm} from "./form.js";
import {render} from "./results.js";

/* ---------- quick start ---------- */
const Q={mode:"couple",names:["",""],birth:["",""],retire:["",""],rrsp:["",""],tfsa:["",""],other:"",cash:"",salary:["",""],save:"",pension:["",""],cpp:["",""],
  province:"BC",home:"",mortgage:"",mortPay:"",spending:""};
let qStep=0;
const nm=i=>Q.names[i]||(i?"Your partner":"You");
const qCols=()=>Q.mode==="single"?[0]:[0,1];
const Q_STEPS=[
  {title:"Let's start with you",lead:"Who the plan is for, when you were born, and when you'd like to stop working.",
   rows:()=>[["mode","Planning for","mode1"],["names","Name","text",["Your name","Partner's name"]],["birth","Birth year","int"],["retire","Retire at age","int"],["province","Province or territory","prov1"]],
   check:()=>{for(const i of qCols()){const b=+Q.birth[i],r=+Q.retire[i]; if(!(b>=1930&&b<=2008)) return "Enter a birth year between 1930 and 2008 for "+nm(i)+"."; if(!(r>=40&&r<=80)) return "Enter a retirement age between 40 and 80 for "+nm(i)+".";}}},
  {title:"What you've saved so far",lead:"Rough numbers are fine. Check your latest statements if they're handy.",
   rows:()=>[["rrsp","RRSP","$"],["tfsa","TFSA","$"],["other","Other investments","$1",Q.mode==="single"?"non-registered":"non-registered, both of you"],["cash","Cash and savings accounts","$1",Q.mode==="single"?"":"both of you"]]},
  {title:"Income and pensions",lead:"Your pay before tax, what you save each year, and any pension you're expecting.",
   rows:()=>[["salary","Salary before tax","$","per year, until retiring"],["save","Saved each year","$1",Q.mode==="single"?"into RRSPs and TFSAs":"both of you, into RRSPs and TFSAs"],["pension","Workplace pension","$","per year, if you'll get one"],["cpp","CPP at 65, monthly","$","from My Service Canada. Leave blank and we'll estimate"]]},
  {title:"Your home",lead:"Home equity is counted in your estate. Your mortgage payments are part of your spending until it's paid off.",
   rows:()=>[["home","Home value","$1"],["mortgage","Mortgage or HELOC owing","$1","leave blank if none"],["mortPay","Monthly payment","$1"]]},
  {title:"Spending in retirement",lead:"How much you want to spend each year in retirement, in today's dollars, not counting mortgage payments. Many people plan for about 70% of what they spend now.",
   rows:()=>[["spending","Spending per year","$1"]],
   check:()=>{if(!(+Q.spending>0)) return "Enter how much you'd like to spend each year.";}}
];
function qField(key,type,i,ph){
  const w=document.createElement("div"); w.className="field"+(type.startsWith("$")?" money":"");
  let el;
  if(type==="mode1"){el=document.createElement("select"); [["couple","Me and a partner"],["single","Just me"]].forEach(([v,l])=>{const op=document.createElement("option");op.value=v;op.textContent=l;el.appendChild(op);}); el.addEventListener("change",()=>{readQ(); renderQ();});}
  else if(type==="prov1"){el=document.createElement("select"); Object.entries(PROV).sort((a,b)=>a[1].name.localeCompare(b[1].name)).forEach(([v,o])=>{const op=document.createElement("option");op.value=v;op.textContent=o.name;el.appendChild(op);});}
  else{el=document.createElement("input"); el.type=type==="text"?"text":"number"; if(type!=="text"){el.inputMode="decimal";el.min="0";el.step=type==="int"?"1":"1000";} if(ph) el.placeholder=ph;}
  const v=i==null?Q[key]:Q[key][i]; el.value=v==null?"":v;
  el.id="q_"+key+(i==null?"":"_"+i); el.dataset.k=key; if(i!=null) el.dataset.i=i;
  w.appendChild(el); return w;
}
function renderQ(){
  const st=Q_STEPS[qStep], body=document.getElementById("qBody"); body.innerHTML="";
  document.getElementById("qStep").textContent="Step "+(qStep+1)+" of "+Q_STEPS.length;
  document.getElementById("qTitle").textContent=st.title; document.getElementById("qLead").textContent=st.lead;
  document.getElementById("qBar").style.width=((qStep+1)/Q_STEPS.length*100)+"%";
  document.getElementById("qErr").textContent="";
  document.getElementById("qBack").style.visibility=qStep?"visible":"hidden";
  document.getElementById("qNext").textContent=qStep===Q_STEPS.length-1?"See my results":"Next";
  const isOne=t=>t==="$1"||t==="prov1"||t==="mode1", cols=qCols();
  body.className="q-body"+(cols.length===1?" one":"");
  const pairs=st.rows().some(r=>!isOne(r[2]));
  if(pairs&&cols.length>1){ const b=document.createElement("div"); b.className="blank"; body.appendChild(b);
    cols.forEach(i=>{const h=document.createElement("div"); h.className="colh"; h.textContent=qStep===0?(i?"Partner":"You"):nm(i); body.appendChild(h);}); }
  st.rows().forEach(([key,label,type,hint])=>{
    const single=isOne(type);
    const l=document.createElement("label"); l.htmlFor="q_"+key+(single?"":"_0"); l.textContent=label;
    if(typeof hint==="string"){const sm=document.createElement("small"); sm.textContent=hint; l.appendChild(sm);}
    body.appendChild(l);
    if(single){const f=qField(key,type==="$1"?"$":type); if(cols.length>1) f.classList.add("span2"); body.appendChild(f);}
    else cols.forEach(i=>{const f=qField(key,type,i,Array.isArray(hint)?hint[i]:""); f.firstChild.setAttribute("aria-label",label+" for "+nm(i)); body.appendChild(f);});
  });
  if(qStep===2){const nt=document.createElement("p"); nt.className="q-note"; nt.textContent="We'll assume CPP and OAS start at 65 and full OAS (40 years in Canada). You can change both later."; body.appendChild(nt);}
  if(qStep===0&&Q.mode==="couple"){const nt=document.createElement("p"); nt.className="q-note"; nt.textContent="Planning for a couple? We'll ask about each of you side by side."; body.appendChild(nt);}
  const first=body.querySelector("input,select"); if(first) first.focus({preventScroll:true});
}
function readQ(){document.querySelectorAll("#qBody [data-k]").forEach(el=>{const k=el.dataset.k; if(el.dataset.i!=null) Q[k][+el.dataset.i]=el.value; else Q[k]=el.value;});}
function buildFromQ(){
  const d=clone(EXAMPLE);
  d.people.forEach((p,i)=>{
    if(Q.mode==="single"&&i>0){ p.name="Partner"; return; }  // kept only in case they switch to a couple later
    const sal=n(Q.salary[i]);
    Object.assign(p,{name:Q.names[i].trim()||(Q.mode==="single"?"You":(i?"Spouse 2":"Spouse 1")),birthYear:n(Q.birth[i]),retireAge:n(Q.retire[i]),lifeAge:95,salary:sal,
      rrsp:n(Q.rrsp[i]),tfsa:n(Q.tfsa[i]),nonreg:n(Q.other)/(Q.mode==="single"?1:2),tfsaRoom:0,pension:n(Q.pension[i]),pensionStart:n(Q.retire[i]),survPct:60,
      cpp65:Q.cpp[i]!==""?n(Q.cpp[i]):Math.round(CPP_MAX_65*clamp(sal/PAY.ympe,0,1)*0.8),cppStart:65,oasYears:40,oasStart:65});
    const half=n(Q.save)/(Q.mode==="single"?1:2); p.tfsaContrib=Math.min(TFSA_ROOM,half); p.rrspContrib=Math.max(0,half-TFSA_ROOM);
  });
  Object.assign(d.house,{mode:Q.mode,province:Q.province||"BC",cash:n(Q.cash),spending:n(Q.spending),spendingLater:n(Q.spending),spendingChangeAge:0,survivorSpend:70,
    homeValue:n(Q.home),mortgage:n(Q.mortgage),mortgageRate:4.5,mortgagePayment:n(Q.mortPay)*12,downsizeAge:0,downsizeAmount:0,ltcCost:0,ltcAge:85,events:[]});
  d.assume.meltTarget=0;
  return d;
}
function showQuick(on){
  document.getElementById("quick").hidden=!on; document.getElementById("mainGrid").hidden=on;
  document.querySelector(".head-right").hidden=on;
  if(on){qStep=0; renderQ();
    const saved=store.scenarios.some(x=>!x.example);
    document.getElementById("qSkip").textContent=saved?"Skip to my saved plans":"Skip and explore the example instead";}
  else drawChart();
}
document.getElementById("qForm").addEventListener("submit",e=>{
  e.preventDefault(); readQ();
  const err=Q_STEPS[qStep].check&&Q_STEPS[qStep].check(); if(err){document.getElementById("qErr").textContent=err; return;}
  if(qStep<Q_STEPS.length-1){qStep++; renderQ(); window.scrollTo({top:0}); return;}
  const id="s"+Date.now(), name="My plan";
  const onlyExample=store.scenarios.length===1&&store.scenarios[0].example;
  const sc={id,name:store.scenarios.some(x=>x.name===name)?name+" "+(store.scenarios.length+1):name,example:false,data:buildFromQ()};
  if(onlyExample) store.scenarios=[sc]; else store.scenarios.push(sc);
  store.active=id; save(); showQuick(false); renderTabs(); buildForm(); render();
  document.getElementById("welcomeNote").hidden=false; window.scrollTo({top:0});
});
document.getElementById("qBack").onclick=()=>{readQ(); if(qStep>0){qStep--; renderQ();}};
document.getElementById("qSkip").onclick=()=>{showQuick(false); save();};
document.getElementById("btnQuick").onclick=()=>showQuick(true);

export {showQuick};
