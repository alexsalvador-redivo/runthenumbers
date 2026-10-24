import {COUPLE_ONLY,ORDERS,isSingle,ppl} from "../engine/plan.js";
import {ASSUME_FIELDS,HOUSE_FIELDS,PEOPLE_FIELDS} from "./fields.js";
import {PROV} from "../engine/tax.js";
import {simulate} from "../engine/simulate.js";
import {esc,full} from "./format.js";
import {active,save,store} from "../storage.js";
import {clone,n} from "../engine/util.js";
import {TODAY} from "../engine/dates.js";
import {mcData} from "./risk.js";
import {okShare,quickMC} from "../engine/montecarlo.js";
import {renderTabs} from "./scenarios.js";
import {buildForm} from "./form.js";
import {render} from "./results.js";

/* ---------- Ask about my plan (Claude) ---------- */
const askEl={panel:document.getElementById("askPanel"),log:document.getElementById("askLog"),form:document.getElementById("askForm"),
  box:document.getElementById("askBox"),send:document.getElementById("askSend"),stop:document.getElementById("askStop"),chips:document.getElementById("askChips")};
let askTurns=[], askCtl=null, askSample=null, askTools=false, askPending=null;
// Fields the assistant may test or propose, keyed by path
function fieldIndex(d){
  const idx={};
  ppl(d).forEach((p,i)=>PEOPLE_FIELDS.forEach(f=>{ if(f[0]==="g"||f[0]==="name"||(isSingle(d)&&COUPLE_ONLY.has(f[0])))return; idx["people."+i+"."+f[0]]={label:(p.name||"Spouse "+(i+1))+": "+f[1],type:f[2]}; }));
  HOUSE_FIELDS.forEach(f=>{ if(f[0]==="g"||(isSingle(d)&&COUPLE_ONLY.has(f[0])))return; idx["house."+f[0]]={label:f[1],type:f[2]}; });
  ASSUME_FIELDS.forEach(f=>{ if(f[0]==="g"||(isSingle(d)&&COUPLE_ONLY.has(f[0])))return; idx["assume."+f[0]]={label:f[1],type:f[2]}; });
  return idx;
}
function applyChanges(d,changes){
  const idx=fieldIndex(d), done=[];
  (Array.isArray(changes)?changes:[]).forEach(c=>{
    const path=String(c&&c.field||""), f=idx[path]; if(!f) throw new Error("Unknown field: "+path+". Use a path from the field list.");
    let v=c.value;
    if(f.type==="prov"){v=String(v).toUpperCase(); if(!PROV[v]) throw new Error("Unknown province code "+v);}
    else if(f.type==="yesno"){v=String(v)==="no"?"no":"yes";}
    else if(f.type==="select"){v=String(v); if(!ORDERS.some(o=>o[0]===v)) throw new Error("Order must be one of: "+ORDERS.map(o=>o[0]).join(" | "));}
    else{v=Number(v); if(!isFinite(v)||v<0) throw new Error(path+" needs a number of 0 or more");}
    const [a,b,c2]=path.split("."); if(a==="people") d.people[+b][c2]=v; else d[a][b]=v;
    done.push({path,label:f.label,value:v,type:f.type});
  });
  return done;
}
function outcome(d){
  const r=simulate(d), end=r.rows[r.rows.length-1]||{};
  return {moneyLastsWholePlan:r.firstShort===null, firstShortYear:r.firstShort===null?null:r.rows[r.firstShort].year,
    estateAfterTax:Math.round(r.estate), lifetimeTaxIncludingClawback:Math.round(r.lifeTax), lifetimeOasClawback:Math.round(r.lifeClaw),
    investmentsAtEnd:Math.round(end.total||0)};
}
const fmtVal=(c)=>c.type==="$"?full(c.value):c.type==="%"?c.value+"%":c.type==="prov"?PROV[c.value].name:c.type==="select"?(ORDERS.find(o=>o[0]===c.value)||[,c.value])[1]:String(c.value);
function planContext(){
  const d=active().data, res=simulate(d), idx=fieldIndex(d);
  const fields=Object.entries(idx).map(([path,f])=>{const [a,b,c]=path.split("."); const v=a==="people"?d.people[+b][c]:d[a][b]; return path+" = "+JSON.stringify(v)+"  ("+f.label+(f.type==="$"?", dollars":f.type==="%"?", percent":"")+")";}).join("\n");
  const rows=res.rows.map(x=>[x.partial?x.year+"(part)":x.year,x.ages.map((a,i)=>x.alive[i]?a:"dead").join("/"),Math.round(x.work),Math.round(x.cpp),Math.round(x.oas),Math.round(x.pen),Math.round(x.rrifMin+x.melt+x.wd.rrsp),Math.round(x.tax),Math.round(x.claw),Math.round(x.spend+x.mortPay+x.evExp+x.ltc),Math.round(x.wd.tfsa+x.wd.nonreg+x.wd.cash),Math.round(x.short),Math.round(x.total),Math.round(x.homeEq)].join(",")).join("\n");
  const events=(d.house.events||[]).map(e=>"- "+(e.label||"Event")+": "+e.kind+" $"+n(e.amount)+" at age "+e.age+(n(e.every)?" every "+e.every+" yrs until "+e.until:"")).join("\n")||"none";
  return "HOUSEHOLD: "+(isSingle(d)?"single person ("+d.people[0].name+")":"couple ("+d.people.map(p=>p.name).join(" and ")+")")+"\nPLAN: "+active().name+(active().example?" (these are the app's EXAMPLE figures, not the user's own)":"")+"\nCurrent date: "+TODAY.toISOString().slice(0,10)+"\n\nINPUT FIELDS (path = value):\n"+fields+
    "\n\nEVENTS (timed by "+(d.people[0].name)+"'s age):\n"+events+
    "\n\nRESULTS: "+JSON.stringify(outcome(d))+(mcData?"\nMarket histories already run: money lasts in "+Math.round(okShare(mcData.runs)*100)+"% of 500.":"")+
    "\n\nYEAR BY YEAR (today's dollars): year,ages,salary,CPP,OAS,pension,RRSP-RRIF withdrawals,income tax,OAS clawback,total spending incl mortgage/events/care,other withdrawals,shortfall,investments at year end,home equity\n"+rows;
}
const ASK_RULES=`You are the assistant built into "Run The Numbers", a Canadian retirement calculator for single people and couples. Answer the user's question about THEIR plan using the plan data provided. All amounts are in today's dollars.
How the model works: 2026 federal and provincial tax brackets and credits held constant in real terms; CPP/OAS timing adjustments; OAS clawback; RRIF minimums from 72; optional pension splitting and CPP sharing (couples); an RRSP drawdown target (draw RRSP up to a taxable income per person after retiring, through a chosen age); survivor rollovers and CPP survivor benefits when the first spouse dies; withdrawals follow the chosen order. Not modelled: tax on non-registered gains, GIS, medical expense credit.
Style: plain language, short paragraphs, under about 180 words unless asked for more. Lead with the direct answer. Quote specific numbers and years from the plan. Explain any term the user may not know in a few words. Simple markdown only (**bold**, "- " bullets).
Tools: before recommending a change, test it with run_what_if (deterministic) and, for risk questions, run_market_test. You can test several options. If a change clearly helps, call propose_change ONCE with your best option so the user can apply it with a click; never say a change has been applied. Only use field paths from the INPUT FIELDS list.
Limits: you are not a licensed financial advisor; for major decisions, suggest confirming with a fee-only planner (once, briefly). Never invent figures that are not in the data or tool results. If the question isn't about retirement planning, say briefly that you can only help with this plan.`;
const ASK_TOOLS=[
  {name:"run_what_if",description:"Recalculate the plan with some fields changed (not saved) and return the steady-return outcome: whether money lasts, first short year, estate after tax, lifetime tax and OAS clawback. Returns the current plan's outcome too for comparison.",
   inputSchema:{type:"object",properties:{changes:{type:"array",items:{type:"object",properties:{field:{type:"string"},value:{}},required:["field","value"]}}},required:["changes"]},
   execute:(input)=>{const d=clone(active().data); const done=applyChanges(d,input.changes); askStatus("Testing "+done.map(c=>c.label+" → "+fmtVal(c)).join(", ")); return {changed:done.map(c=>c.path+"="+c.value),withChanges:outcome(d),current:outcome(active().data)};}},
  {name:"run_market_test",description:"Run 200 randomized market histories (same seed every time, so results are comparable) on the plan with optional changes; returns the percent of histories where the money lasts, for both the changed and current plan. Takes a few seconds.",
   inputSchema:{type:"object",properties:{changes:{type:"array",items:{type:"object",properties:{field:{type:"string"},value:{}},required:["field","value"]}}}},
   execute:(input)=>{const d=clone(active().data); const done=applyChanges(d,input.changes||[]); askStatus("Running market histories"+(done.length?" with "+done.map(c=>c.label+" → "+fmtVal(c)).join(", "):"")+"…"); return {successPercentWithChanges:quickMC(d,200),successPercentCurrent:quickMC(clone(active().data),200)};}},
  {name:"propose_change",description:"Show the user a card with a suggested change and an Apply button. Use once per answer for your best tested option. The change is only applied if the user clicks Apply.",
   inputSchema:{type:"object",properties:{title:{type:"string",description:"Short name, e.g. 'Delay CPP to 70'"},changes:{type:"array",items:{type:"object",properties:{field:{type:"string"},value:{}},required:["field","value"]}}},required:["title","changes"]},
   execute:(input)=>{const d=clone(active().data); const done=applyChanges(d,input.changes); askPending={title:String(input.title||"Suggested change").slice(0,80),changes:done,scen:store.active}; return "Shown to the user with an Apply button. They decide.";}}
];
function mdLite(t){
  const lines=esc(t).split("\n"); let html="", inList=false;
  lines.forEach(l=>{const b=l.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
    if(/^\s*[-•]\s+/.test(l)){ if(!inList){html+="<ul>";inList=true;} html+="<li>"+b.replace(/^\s*[-•]\s+/,"")+"</li>"; }
    else{ if(inList){html+="</ul>";inList=false;} if(l.trim()) html+="<p>"+b+"</p>"; } });
  return html+(inList?"</ul>":"");
}
function addMsg(role,html){const m=document.createElement("div"); m.className="msg "+role; m.innerHTML=html; askEl.log.appendChild(m); askEl.log.scrollTop=askEl.log.scrollHeight; return m;}
let statusEl=null; function askStatus(t){ if(statusEl){statusEl.textContent=t; statusEl.hidden=false;} }
const ASK_ERR={not_granted:"Claude isn't allowed on this page. You can turn it on from the page's permissions.",sampling_disabled:"Claude isn't available on this account.",rate_limited:"Too many questions at once, or you've reached a usage limit. Try again in a bit.",session_expired:"Please sign in to Claude again, then ask.",refused:"Claude couldn't answer that. Try asking it differently.",empty_completion:"No answer came back. Try a simpler question.",prompt_too_large:"Your plan is too large to send. Remove some events and try again."};
async function ask(q){
  if(!askSample||!q.trim()) return;
  askEl.chips.hidden=true;
  addMsg("user",esc(q));
  askTurns.push({role:"user",content:q});
  const bot=addMsg("bot",'<span class="thinking">Thinking…</span>');
  statusEl=document.createElement("div"); statusEl.className="tool-status"; statusEl.hidden=true; bot.before(statusEl);
  askCtl=new AbortController(); askEl.send.hidden=true; askEl.stop.hidden=false; askEl.box.disabled=true; askPending=null;
  const input=[{role:"user",content:ASK_RULES+"\n\n"+planContext()+"\n\nThe user's conversation follows."},...askTurns.slice(-10)];
  try{
    const opts={signal:askCtl.signal,cache:false,onText:({text})=>{bot.innerHTML=mdLite(text); askEl.log.scrollTop=askEl.log.scrollHeight;}};
    if(askTools){opts.tools=ASK_TOOLS; delete opts.cache;}
    const {text,truncated}=await askSample(input,opts);
    bot.innerHTML=mdLite(text)+(truncated?'<p class="muted">The answer was cut short. Ask a narrower question for more.</p>':"");
    askTurns.push({role:"assistant",content:text});
  }catch(e){
    if(e.text) bot.innerHTML=mdLite(e.text); else bot.innerHTML="";
    if(e.code!=="cancelled") addMsg("note",esc(ASK_ERR[e.code]||"Something went wrong reaching Claude. Try again."));
    if(e.code==="not_granted"||e.code==="sampling_disabled"){askEl.form.hidden=true;}
    if(e.text) askTurns.push({role:"assistant",content:e.text}); else askTurns.pop();
    if(!bot.innerHTML) bot.remove();
  }finally{
    if(statusEl) statusEl.remove(); statusEl=null;
    askEl.send.hidden=false; askEl.stop.hidden=true; askEl.box.disabled=false; askEl.box.focus();
    if(askPending) showProposal(askPending);
  }
}
function showProposal(pr){
  const card=document.createElement("div"); card.className="proposal";
  card.innerHTML="<b>"+esc(pr.title)+"</b><ul>"+pr.changes.map(c=>"<li>"+esc(c.label)+": <span class=\"num\">"+esc(fmtVal(c))+"</span></li>").join("")+"</ul>";
  const row=document.createElement("div"); row.className="actions";
  const ap=document.createElement("button"); ap.type="button"; ap.className="btn primary"; ap.textContent="Apply to "+(store.scenarios.find(s=>s.id===pr.scen)||active()).name;
  const cp=document.createElement("button"); cp.type="button"; cp.className="btn"; cp.textContent="Try as a new scenario";
  const no=document.createElement("button"); no.type="button"; no.className="btn"; no.textContent="Dismiss";
  ap.onclick=()=>{ store.active=pr.scen; applyChanges(active().data,pr.changes.map(c=>({field:c.path,value:c.value}))); active().example=false; save(); renderTabs(); buildForm(); render(); card.innerHTML="<span class=\"muted\">Applied: "+esc(pr.title)+".</span>"; };
  cp.onclick=()=>{ const src=store.scenarios.find(s=>s.id===pr.scen)||active(), id="s"+Date.now(), dd=clone(src.data);
    applyChanges(dd,pr.changes.map(c=>({field:c.path,value:c.value}))); store.scenarios.push({id,name:pr.title.slice(0,40),example:false,data:dd}); store.active=id; save(); renderTabs(); buildForm(); render();
    card.innerHTML="<span class=\"muted\">Saved as a new scenario: "+esc(pr.title)+". Your original plan is unchanged.</span>"; };
  no.onclick=()=>card.remove();
  row.append(ap,cp,no); card.appendChild(row); askEl.log.appendChild(card); askEl.log.scrollTop=askEl.log.scrollHeight;
}
askEl.form.addEventListener("submit",e=>{e.preventDefault(); const q=askEl.box.value; askEl.box.value=""; ask(q);});
askEl.box.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); askEl.form.requestSubmit();} });
askEl.stop.onclick=()=>askCtl&&askCtl.abort();
askEl.chips.addEventListener("click",e=>{const b=e.target.closest("button"); if(b) ask(b.textContent);});
document.getElementById("askClear").onclick=()=>{ if(askCtl) askCtl.abort(); askTurns=[]; askEl.log.innerHTML=""; askEl.chips.hidden=false; };
(async()=>{
  try{ askSample=await window.claude?.use("sample"); }catch(e){ askSample=null; }
  if(!askSample) return;
  try{ const lim=await askSample.limits(); askTools=!!(lim&&lim.tools); }catch(e){ askTools=false; }
  askEl.panel.hidden=false;
})();

export {askSample,mdLite,ASK_ERR};
