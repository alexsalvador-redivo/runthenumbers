import {active,migrate,save,setStore,store,validStore} from "../storage.js";
import {buildForm,readForm} from "./form.js";
import {render,renderCompare} from "./results.js";
import {clone,n} from "../engine/util.js";
import {findTargets} from "../engine/simulate.js";
import {full,money} from "./format.js";
import {EXAMPLE} from "../engine/plan.js";

/* ---------- scenarios ---------- */
function renderTabs(){
  const t=document.getElementById("scenTabs"); t.innerHTML="";
  store.scenarios.forEach(s=>{const b=document.createElement("button");b.type="button";b.className="tab";b.textContent=s.name;b.setAttribute("aria-pressed",String(s.id===store.active));
    b.onclick=()=>{store.active=s.id;save();renderTabs();buildForm();render();}; t.appendChild(b);});
  const add=document.createElement("button");add.type="button";add.className="tab ghost";add.textContent="+ Copy";add.title="Copy the open scenario";add.onclick=copyScenario;t.appendChild(add);
  document.getElementById("btnDelete").disabled=store.scenarios.length<2;
}
function copyScenario(){
  if(store.scenarios.length>=6) return;
  const s=active(), id="s"+Date.now();
  store.scenarios.push({id,name:s.name+" (copy)",example:s.example,data:clone(s.data)}); store.active=id;
  save();renderTabs();buildForm();render();
}
document.getElementById("btnCopy").onclick=copyScenario;
function runFinder(){
  const d=active().data, {out,best}=findTargets(d), cur=n(d.assume.meltTarget);
  const tb=document.getElementById("finderTbl");
  let h="<thead><tr><th>Draw up to</th><th>Lifetime tax</th><th>OAS clawback</th><th>Estate after tax</th><th>Money lasts</th><th></th></tr></thead><tbody>";
  out.forEach(o=>{h+="<tr class=\""+(o===best?"event":"")+"\"><td>"+(o.t?full(o.t):"Off")+(o===best?" · best":"")+(o.t===cur?" (current)":"")+"</td><td>"+full(o.life)+"</td><td>"+full(o.claw)+"</td><td>"+full(o.estate)+"</td><td>"+(o.short===null?"Yes":"Short in "+o.short)+"</td><td>"+(o.t===cur?"":"<button class=\"btn\" type=\"button\" data-t=\""+o.t+"\" style=\"padding:3px 9px;font-size:12px\">Use</button>")+"</td></tr>";});
  tb.innerHTML=h+"</tbody>";
  document.getElementById("finderWrap").hidden=false;
  const base=out.find(o=>o.t===0), gain=best.estate-base.estate;
  document.getElementById("finderNote").textContent=best.t===0?"Drawing the RRSP early doesn't help with these numbers. Your current approach is already the best of the targets tested.":
    "Drawing up to "+full(best.t)+" a year leaves about "+money(gain)+" more after tax than no drawdown"+(base.life>best.life?", and cuts lifetime tax by "+money(base.life-best.life)+".":".");
}
document.getElementById("btnFind").onclick=runFinder;
/* backup */
const bMsg=document.getElementById("backupMsg"), bText=document.getElementById("backupText");
document.getElementById("btnBackup").onclick=()=>{
  const txt=JSON.stringify({app:"run-the-numbers",version:1,saved:new Date().toISOString().slice(0,10),...store});
  const fallback=()=>{bText.value=txt; bText.focus(); bText.select(); bMsg.textContent="Copying isn't allowed here. The backup is selected in the box above. Copy it and save it somewhere safe, like a note or email to yourself.";};
  try{ navigator.clipboard.writeText(txt).then(()=>{bMsg.textContent="Backup copied. Paste it somewhere safe, like a note or an email to yourself.";},fallback);}catch(e){fallback();}
};
const rBtn=document.getElementById("btnRestore"); let rArm=null, rT;
rBtn.onclick=()=>{
  let s; try{s=JSON.parse(bText.value.trim());}catch(e){bMsg.textContent="That text isn't a backup from this calculator. Paste the whole backup, starting with { and ending with }."; return;}
  if(!validStore(s)){bMsg.textContent="That backup is missing scenario data. Make sure you pasted the whole thing."; return;}
  if(rArm!==bText.value){rArm=bText.value; rBtn.textContent="Click again to replace your "+store.scenarios.length+" scenario"+(store.scenarios.length>1?"s":""); clearTimeout(rT); rT=setTimeout(()=>{rArm=null;rBtn.textContent="Restore from backup";},4000); return;}
  migrate(s); setStore({active:s.active,scenarios:s.scenarios}); save(); rArm=null; rBtn.textContent="Restore from backup"; bText.value="";
  bMsg.textContent="Restored "+store.scenarios.length+" scenario"+(store.scenarios.length>1?"s":"")+".";
  renderTabs(); buildForm(); render();
};
document.getElementById("finderTbl").addEventListener("click",e=>{const b=e.target.closest("button[data-t]"); if(!b)return;
  active().data.assume.meltTarget=+b.dataset.t; active().example=false; save(); buildForm(); render(); runFinder();});
document.getElementById("btnReset").onclick=()=>{const s=active(); s.data=clone(EXAMPLE); s.example=true; save(); buildForm(); render();};
const del=document.getElementById("btnDelete"); let armT;
del.onclick=()=>{
  if(store.scenarios.length<2) return;
  if(!del.classList.contains("armed")){del.classList.add("armed");del.textContent="Click again to delete";clearTimeout(armT);armT=setTimeout(()=>{del.classList.remove("armed");del.textContent="Delete scenario";},3000);return;}
  store.scenarios=store.scenarios.filter(s=>s.id!==store.active); store.active=store.scenarios[0].id;
  del.classList.remove("armed"); del.textContent="Delete scenario"; save(); renderTabs(); buildForm(); render();
};
document.getElementById("scenName").addEventListener("input",e=>{active().name=e.target.value||"Untitled";save();renderTabs();renderCompare();});

let deb;
document.querySelector(".inputs").addEventListener("input",e=>{
  if(e.target.id==="scenName"||e.target.id==="backupText") return;
  readForm(); active().example=false; document.getElementById("exampleNote").hidden=true;
  clearTimeout(deb); deb=setTimeout(()=>{save();render();document.getElementById("finderWrap").hidden=true;},120);
});
document.querySelector(".inputs").addEventListener("change",e=>{ if(e.target.tagName==="SELECT"){readForm();active().example=false;save();render();document.getElementById("finderWrap").hidden=true;} });

export {renderTabs};
