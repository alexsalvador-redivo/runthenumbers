import {START_YEAR,F0} from "./dates.js";
import {clamp,n,clone} from "./util.js";
import {SURV,survCppAnnual,rrifFactor,cppAnnual,oasAnnual} from "./benefits.js";
import {PROV,TFSA_ROOM,payroll,personTax,houseTax,setPV} from "./tax.js";
import {ppl} from "./plan.js";

function simulate(d,rets){
  const P=ppl(d), H=d.house, A=d.assume, splitOn=A.split!=="no";
  setPV(PROV[H.province]||PROV.BC);
  const inf=n(A.inflation)/100;
  const r=(1+n(A.returnRate)/100)/(1+inf)-1, rc=(1+n(A.cashRate)/100)/(1+inf)-1;
  const order=A.order.split(",");
  const acc=P.map(p=>({rrsp:n(p.rrsp),tfsa:n(p.tfsa),nonreg:n(p.nonreg)}));
  let cash=n(H.cash), home=n(H.homeValue), mort=n(H.mortgage);
  const room=P.map(p=>n(p.tfsaRoom)), target=n(A.meltTarget), mEnd=n(A.meltEnd)||71;
  const lastYear=Math.max(...P.map(p=>n(p.birthYear)+(n(p.lifeAge)||95)));
  const alive=P.map(()=>true), survPen=P.map(()=>0), deceased=P.map(()=>-1);
  const rows=[]; let firstShort=null, prevRet=null; const flex=clamp(n(A.flexCut),0,50)/100;
  for(let y=START_YEAR,k=0;y<=lastYear&&k<80;y++,k++){
    const part=(k===0&&F0<1)?F0:1;  // share of this year still ahead
    if(part===1) room.forEach((_,i)=>room[i]+=TFSA_ROOM);  // this year's room is already in "unused room"
    const roomBack=P.map(()=>0);
    const ages=P.map(p=>y-n(p.birthYear)), deflate=Math.pow(1+inf,k+1);
    const row={year:y,ages,events:[],alive:alive.slice()}, couple=alive.every(Boolean);
    if(n(H.downsizeAge)>0&&ages[0]===n(H.downsizeAge)&&n(H.downsizeAmount)>0){
      const rel=Math.min(n(H.downsizeAmount),home); home-=rel;
      const net=Math.max(0,rel-mort/Math.pow(1+inf,k)); mort=0;
      acc.forEach(a=>a.nonreg+=net/acc.length); row.events.push("Downsize");
    }
    // one-time / recurring events, timed by spouse 1's age
    let evExp=0, evFree=0; const evInc=P.map(()=>0);
    (H.events||[]).forEach(e=>{
      const ag=ages[0], at=n(e.age), ev=n(e.every), un=n(e.until), amt=n(e.amount);
      const on=amt>0&&ag>=at&&(ev>0?((ag-at)%ev===0&&(!un||ag<=un)):ag===at); if(!on) return;
      if(e.kind==="expense") evExp+=amt; else if(e.kind==="free") evFree+=amt;
      else { const w=+e.who||0, i=alive[w]?w:alive.findIndex(Boolean); if(i>=0) evInc[i]+=amt; }
    });
    if(evFree>0){ const live=P.map((_,i)=>i).filter(i=>alive[i]); let x=evFree;
      live.forEach(i=>{const t=Math.min(x,Math.max(0,room[i])); acc[i].tfsa+=t; room[i]-=t; x-=t;});
      live.forEach(i=>acc[i].nonreg+=x/live.length); }
    const ltc=P.reduce((s,p,i)=>s+((alive[i]&&n(H.ltcCost)>0&&ages[i]>=n(H.ltcAge))?n(H.ltcCost):0),0);
    // snapshot so a partial first year can keep only its share of the year's flows
    const snap=part<1?{acc:acc.map(a=>({...a})),cash,mort,room:room.slice()}:null;
    let contrib=0;
    const base=P.map((p,i)=>{
      const a=ages[i];
      if(!alive[i]) return {age:a,alive:false,working:false,salary:0,pay:payroll(0),rrspDed:0,pension:0,cpp:0,oas:0,survCpp:0};
      const working=a<n(p.retireAge), salary=working?n(p.salary):0;
      if(working) contrib+=n(p.rrspContrib)+n(p.tfsaContrib);
      if(a===n(p.retireAge)) row.events.push(p.name+" retires");
      return {age:a,working,salary,other:evInc[i],pay:payroll(salary),rrspDed:working?n(p.rrspContrib):0,
        pension:((n(p.pension)>0&&a>=n(p.pensionStart))?n(p.pension):0)+survPen[i],
        cpp:a>=clamp(n(p.cppStart),60,70)?cppAnnual(p):0,
        oas:a>=clamp(n(p.oasStart),65,70)?oasAnnual(p,a):0};
    });
    // CPP pension sharing: while both are alive and collecting, the part earned together is split evenly
    let cppShared=0;
    if(A.cppShare==="yes"&&couple&&base.length===2&&base[0].cpp>0&&base[1].cpp>0){
      const f=clamp(n(A.cppShareYears),0,100)/100, avg=(base[0].cpp+base[1].cpp)/2;
      const c0=base[0].cpp*(1-f)+avg*f, c1=base[1].cpp*(1-f)+avg*f; cppShared=Math.abs(c0-base[0].cpp); base[0].cpp=c0; base[1].cpp=c1;
    }
    base.forEach((b,i)=>{ if(alive[i]&&deceased[i]>=0){ b.survCpp=survCppAnnual(cppAnnual(P[i])*(b.cpp>0?1:0),P[deceased[i]],b.age); b.cpp+=b.survCpp; } });
    const rmin=acc.map((a,i)=>{const m=a.rrsp*rrifFactor(ages[i]); a.rrsp-=m; return m;});
    const rrifMin=rmin.reduce((s,x)=>s+x,0);
    // planned RRSP drawdown up to a taxable-income target, after retiring and through mEnd
    const melt=acc.map((a,i)=>{ if(!alive[i]||target<=0||base[i].working||ages[i]>mEnd||a.rrsp<=0) return 0;
      const inc=base[i].pension+base[i].cpp+base[i].oas+rmin[i]; const x=Math.min(a.rrsp,Math.max(0,target-inc)); a.rrsp-=x; return x;});
    const meltTot=melt.reduce((s,x)=>s+x,0);
    const mins=rmin.map((m,i)=>m+melt[i]), forced=rrifMin+meltTot;
    let mortPay=0;
    if(mort>0){const nom=mort*(1+n(H.mortgageRate)/100),pay=Math.min(n(H.mortgagePayment),nom); mort=nom-pay; mortPay=pay/deflate;}
    const spend=((n(H.spendingChangeAge)>0&&ages[0]>=n(H.spendingChangeAge))?n(H.spendingLater):n(H.spending))*(couple?1:n(H.survivorSpend||100)/100)*((flex>0&&prevRet!==null&&prevRet<0&&base.every(b=>!b.working))?1-flex:1);
    const payTot=base.reduce((s,b)=>s+b.pay.total,0);
    const gross=base.reduce((s,b)=>s+b.salary+(b.other||0)+b.pension+b.cpp+b.oas,0);
    const rr0=acc.reduce((s,a)=>s+a.rrsp,0), share=acc.map(a=>rr0>0?a.rrsp/rr0:0);
    const evalG=G=>{const w=mins.map((m,i)=>m+G*share[i]); const T=houseTax(base,w,splitOn&&couple); return {cashIn:gross+forced+G-T.total-payTot,T};};
    const outflow=spend+mortPay+contrib+evExp+ltc;
    let cur=evalG(0), gap=outflow-cur.cashIn, G=0;
    const wd={cash:0,nonreg:0,rrsp:0,tfsa:0}; let saved=0, short=0, tfsaIn=0;
    if(gap<0){
      let s=Math.min(-gap,forced);
      acc.forEach((a,i)=>{ if(s<=0)return; const x=Math.min(s,Math.max(0,room[i])); a.tfsa+=x; room[i]-=x; s-=x; saved+=x; tfsaIn+=x; });
      if(s>0&&forced>0){acc.forEach((a,i)=>a.nonreg+=s*mins[i]/forced); saved+=s;}
    } else {
      for(const kind of order){
        if(gap<=0.5) break;
        if(kind==="cash"){const x=Math.min(gap,cash); cash-=x; wd.cash+=x; gap-=x; continue;}
        if(kind==="rrsp"){
          if(rr0<=0) continue;
          const c0=cur.cashIn, top=evalG(rr0);
          if(top.cashIn-c0<=gap){G=rr0; cur=top;}
          else{let lo=0,hi=rr0; for(let it=0;it<22;it++){const mid=(lo+hi)/2; (evalG(mid).cashIn-c0<gap)?lo=mid:hi=mid;} G=hi; cur=evalG(G);}
          acc.forEach((a,i)=>a.rrsp-=G*share[i]); wd.rrsp=G; gap-=cur.cashIn-c0; continue;
        }
        const bal=acc.reduce((s,a)=>s+a[kind],0); if(bal<=0) continue;
        const x=Math.min(gap,bal); acc.forEach((a,i)=>{const xi=x*a[kind]/bal; a[kind]-=xi; if(kind==="tfsa") roomBack[i]+=xi;}); wd[kind]+=x; gap-=x;
      }
      if(gap>0.5){short=gap; if(firstShort===null) firstShort=rows.length;}
    }
    P.forEach((p,i)=>{ if(base[i].working){acc[i].rrsp+=n(p.rrspContrib); acc[i].tfsa+=n(p.tfsaContrib); room[i]=Math.max(0,room[i]-n(p.tfsaContrib));} room[i]+=roomBack[i]; });
    if(snap){
      acc.forEach((a,i)=>["rrsp","tfsa","nonreg"].forEach(key=>a[key]=snap.acc[i][key]+part*(a[key]-snap.acc[i][key])));
      cash=snap.cash+part*(cash-snap.cash); mort=snap.mort+part*(mort-snap.mort);
      room.forEach((_,i)=>room[i]=snap.room[i]+part*(room[i]-snap.room[i]));
    }
    const rk=rets?rets[k]:r; prevRet=rk;
    const gk=Math.pow(1+rk,part)-1, gc=Math.pow(1+rc,part)-1;
    acc.forEach(a=>{a.rrsp=Math.max(0,a.rrsp)*(1+gk);a.tfsa=Math.max(0,a.tfsa)*(1+gk);a.nonreg=Math.max(0,a.nonreg)*(1+gk);}); cash*=1+gc;
    const T=cur.T, bal={rrsp:acc.reduce((s,a)=>s+a.rrsp,0),tfsa:acc.reduce((s,a)=>s+a.tfsa,0),nonreg:acc.reduce((s,a)=>s+a.nonreg,0),cash};
    const tax=T.per.reduce((s,x)=>s+x.tax,0), claw=T.per.reduce((s,x)=>s+x.claw,0), totInc=gross+forced+G;
    Object.assign(row,{work:base.reduce((s,b)=>s+b.salary,0),cpp:base.reduce((s,b)=>s+b.cpp,0),oas:base.reduce((s,b)=>s+b.oas,0),pen:base.reduce((s,b)=>s+b.pension,0),
      rrifMin,melt:meltTot,tfsaIn,cppShared,tax,claw,payroll:payTot,split:T.split,splitFrom:T.from,taxPer:T.per.map(x=>x.tax+x.claw),netPer:T.per.map(x=>x.net),
      avgRate:totInc>0?(tax+claw)/totInc:0,totInc,retired:base.every(b=>!b.working),
      spend,mortPay,contrib,evExp,evIn:evFree+evInc.reduce((s,x)=>s+x,0),ltc,wd,saved,short,bal,total:bal.rrsp+bal.tfsa+bal.nonreg+bal.cash,homeEq:Math.max(0,home-mort/deflate)});
    // deaths at year end: registered plans and non-registered roll to the survivor
    const dying=P.map((p,i)=>alive[i]&&ages[i]>=(n(p.lifeAge)||95));
    dying.forEach((d,i)=>{ if(!d)return; alive[i]=false; row.events.push(P[i].name+" passes away at "+ages[i]); });
    dying.forEach((d,i)=>{ if(!d)return; const j=alive.findIndex(Boolean); if(j<0)return;
      acc[j].rrsp+=acc[i].rrsp; acc[j].tfsa+=acc[i].tfsa; acc[j].nonreg+=acc[i].nonreg; acc[i]={rrsp:0,tfsa:0,nonreg:0};
      if(n(P[i].pension)>0&&ages[i]>=n(P[i].pensionStart)) survPen[j]+=n(P[i].pension)*n(P[i].survPct)/100;
      deceased[j]=i; cash+=SURV.death; });
    row.survCpp=base.reduce((s,b)=>s+(b.survCpp||0),0);
    if(part<1){ row.partial=part;
      ["work","cpp","oas","pen","rrifMin","melt","tfsaIn","tax","claw","payroll","split","spend","mortPay","contrib","evExp","evIn","ltc","saved","short","totInc","survCpp","cppShared"].forEach(key=>{if(typeof row[key]==="number") row[key]*=part;});
      Object.keys(row.wd).forEach(key=>row.wd[key]*=part); }
    rows.push(row);
    if(!alive.some(Boolean)) break;
  }
  const end=rows[rows.length-1]||{bal:{rrsp:0},total:0,homeEq:0};
  const z={salary:0,pay:payroll(0),rrspDed:0,cpp:0,oas:0,pension:0,splitIn:0,splitOut:0,age:95};
  const estateTax=end.bal.rrsp>0?personTax({...z,rrspW:end.bal.rrsp,elig:end.bal.rrsp}).tax:0;
  return {rows,firstShort,lifeTax:rows.reduce((s,x)=>s+x.tax+x.claw,0),lifeClaw:rows.reduce((s,x)=>s+x.claw,0),
    estateTax,estate:end.total-estateTax+end.homeEq};
}
function findTargets(d){
  const out=[];
  for(const t of [0,30000,40000,45000,50000,55000,60000,65000,70000,80000,90000,100000]){
    const c=clone(d); c.assume.meltTarget=t; const r=simulate(c);
    out.push({t,life:r.lifeTax,claw:r.lifeClaw,estate:r.estate,short:r.firstShort===null?null:r.rows[r.firstShort].year});
  }
  const ok=out.filter(o=>o.short===null), pool=ok.length?ok:out;
  const best=pool.reduce((b,o)=>(o.short===null&&b.short!==null)||o.estate>b.estate?o:b,pool[0]);
  return {out,best};
}

export {simulate,findTargets};
