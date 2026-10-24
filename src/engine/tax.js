import {TD,B} from "./benefits.js";
import {clamp} from "./util.js";

// 2026 tax parameters (CRA, Revenu Québec, provincial budgets). Held constant in today's dollars.
const CEA=TD.cea; // Canada employment amount
const FED=TD.fed;
const PROV=TD.prov;
let PV=PROV.BC;
// Ontario Health Premium (not indexed)
function onHealth(x){
  const steps=[[20000,0,.06,300],[36000,300,.06,450],[48000,450,.25,600],[72000,600,.25,750],[200000,750,.25,900]];
  let p=0; for(const [lo,b,r,cap] of steps){ if(x>lo) p=Math.min(cap,b+(x-lo)*r); } return p;
}
const OAS_THR=B.oasThreshold, TFSA_ROOM=B.tfsaLimit;
const PAY={cppRate:B.cppRate,cppEx:B.cppExemption,ympe:B.ympe,cpp2Rate:B.cpp2Rate,yampe:B.yampe,eiRate:B.eiRate,eiMax:B.eiMax};
function bracketTax(x,br){let t=0,prev=0;for(const [top,r] of br){if(x>prev)t+=(Math.min(x,top)-prev)*r;if(x<=top)break;prev=top;}return t;}
function payroll(s){
  if(s<=0) return {cppBase:0,cppEnh:0,ei:0,total:0};
  const cpp=Math.max(0,Math.min(s,PAY.ympe)-PAY.cppEx)*PAY.cppRate, cpp2=Math.max(0,Math.min(s,PAY.yampe)-PAY.ympe)*PAY.cpp2Rate, ei=Math.min(s,PAY.eiMax)*PAY.eiRate;
  return {cppBase:cpp*4.95/5.95,cppEnh:cpp/5.95+cpp2,ei,total:cpp+cpp2+ei};
}
// One person's federal + provincial tax and OAS recovery for a year (province in PV)
function personTax(o){
  const income=o.salary+(o.other||0)+o.pension+o.cpp+o.oas+o.rrspW-o.splitOut+o.splitIn;
  const net0=Math.max(0,income-o.rrspDed-o.pay.cppEnh);
  const claw=o.oas>0?Math.min(o.oas,Math.max(0,.15*(net0-OAS_THR))):0;
  const net=net0-claw, elig=Math.max(0,o.elig-o.splitOut+o.splitIn);
  const bpa=FED.bpaMax-clamp((net-FED.bpaLo)/(FED.bpaHi-FED.bpaLo),0,1)*(FED.bpaMax-FED.bpaMin);
  const fAge=o.age>=65?Math.max(0,FED.age-.15*Math.max(0,net-FED.ageThr)):0;
  let fed=Math.max(0,bracketTax(net,FED.br)-FED.rate*(bpa+fAge+Math.min(FED.pen,elig)+o.pay.cppBase+o.pay.ei+Math.min(CEA,o.salary||0)));
  const V=PV; let pt;
  if(V.qc){
    fed*=1-V.qc.abate;
    const fam=o.familyNet!=null?o.familyNet:net;
    const extra=Math.max(0,(o.age>=65?V.qc.age:0)+Math.min(V.qc.ret,elig)+(o.single?V.qc.alone:0)-V.qc.red*Math.max(0,fam-V.qc.thr));
    pt=Math.max(0,bracketTax(net,V.br)-V.rate*(V.bpa+extra+o.pay.cppBase+o.pay.ei));
  } else {
    let pbpa=V.bpaFed?bpa:V.bpa;
    if(V.bpaPhase){const [lo,hi,mn]=V.bpaPhase; pbpa=V.bpa-clamp((net-lo)/(hi-lo),0,1)*(V.bpa-mn);}
    const pAge=o.age>=65?Math.max(0,V.age-.15*Math.max(0,net-V.ageThr))+(V.seniorSupp||0):0;
    pt=Math.max(0,bracketTax(net,V.br)-V.rate*(pbpa+pAge+Math.min(V.pen,elig)+o.pay.cppBase+o.pay.ei));
    if(V.onSurtax){let sur=0; for(const [thr,r] of V.onSurtax) sur+=Math.max(0,pt-thr)*r; pt+=sur;}
    if(V.bcRed) pt=Math.max(0,pt-Math.max(0,V.bcRed.max-V.bcRed.rate*Math.max(0,net-V.bcRed.thr)));
    if(V.onHealth) pt+=onHealth(net);
  }
  return {tax:fed+pt,claw,income,net};
}
// Household tax, choosing the best pension split when allowed
function houseTax(base,rrspW,splitOn){
  const elig=base.map((b,i)=>b.pension+(b.age>=65?rrspW[i]:0));
  const single=base.filter(b=>b.alive!==false).length<2;
  const run=(from,amt)=>{
    const os=base.map((b,i)=>({...b,single,rrspW:rrspW[i],elig:elig[i],splitOut:i===from?amt:0,splitIn:(from>=0&&i!==from)?amt:0}));
    if(PV.qc){const fam=os.reduce((s,o)=>s+personTax(o).net,0); os.forEach(o=>o.familyNet=fam);}
    return os.map(personTax);
  };
  const cost=r=>r.reduce((s,x)=>s+x.tax+x.claw,0);
  let best=run(-1,0), bestCost=cost(best), split=0, from=-1;
  if(splitOn && base.length===2){
    for(const f of [0,1]) for(let k=1;k<=10;k++){ if(PV.qc&&base[f].age<65) break;const amt=elig[f]*k/20; if(amt<=0)break; const r=run(f,amt),c=cost(r); if(c<bestCost-0.5){best=r;bestCost=c;split=amt;from=f;}}
  }
  return {per:best,total:bestCost,split,from};
}

// The province whose rates personTax and houseTax use
const setPV=v=>{PV=v;};

export {CEA,FED,PROV,onHealth,OAS_THR,TFSA_ROOM,PAY,bracketTax,payroll,personTax,houseTax,setPV};
