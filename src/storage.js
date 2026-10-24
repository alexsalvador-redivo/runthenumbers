import {n,clone} from "./engine/util.js";
import {EXAMPLE} from "./engine/plan.js";

/* ---------- state & storage ---------- */
const KEY="run-the-numbers-v1";
let store;
let firstVisit=false;
function load(){
  try{const s=JSON.parse(localStorage.getItem(KEY)); if(validStore(s)){ migrate(s); return s;}}catch(e){}
  firstVisit=true;
  return {active:"s1",scenarios:[{id:"s1",name:"Example plan",example:true,data:clone(EXAMPLE)}]};
}
function validStore(s){return !!(s&&Array.isArray(s.scenarios)&&s.scenarios.length&&s.scenarios.every(x=>x&&x.id&&x.data&&Array.isArray(x.data.people)&&x.data.people.length===2&&x.data.house&&x.data.assume));}
function migrate(s){
    s.scenarios.forEach(sc=>{const d=sc.data; d.people.forEach(p=>{if(p.salary==null){p.salary=Math.round(n(p.takeHome)/0.72/1000)*1000; delete p.takeHome;}});
      if(d.assume.split==null){d.assume.split="yes"; delete d.assume.taxRate;}
      if(d.assume.meltTarget==null){d.assume.meltTarget=0; d.assume.meltEnd=71;}
      d.people.forEach(p=>{if(p.tfsaRoom==null)p.tfsaRoom=0; if(p.lifeAge==null)p.lifeAge=n(d.assume.endAge)||95; if(p.survPct==null)p.survPct=60;});
      if(d.house.survivorSpend==null)d.house.survivorSpend=70; if(!d.house.province)d.house.province="BC"; delete d.assume.endAge;
      if(d.assume.volatility==null)d.assume.volatility=10; if(d.assume.flexCut==null)d.assume.flexCut=0; if(!d.assume.cppShare){d.assume.cppShare="no";d.assume.cppShareYears=100;}
      if(!Array.isArray(d.house.events))d.house.events=[]; if(d.house.ltcCost==null){d.house.ltcCost=0;d.house.ltcAge=85;}});
    if(!s.scenarios.some(x=>x.id===s.active)) s.active=s.scenarios[0].id;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
store=load();
const active=()=>store.scenarios.find(s=>s.id===store.active)||store.scenarios[0];
// Replaces every scenario, as restoring a backup does
const setStore=s=>{store=s;};

export {KEY,store,setStore,load,validStore,migrate,save,active};
