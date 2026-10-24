import {n} from "./util.js";
import {ppl} from "./plan.js";
import {simulate} from "./simulate.js";

function realRet(d){return (1+n(d.assume.returnRate)/100)/(1+n(d.assume.inflation)/100)-1;}
function retYearOf(d){return Math.max(...ppl(d).map(p=>n(p.birthYear)+n(p.retireAge)));}
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// The current market-history job. Starting a new one (++mc.job) stops any run still going.
const mc={job:0};
// Runs N market histories with a fixed seed so results are comparable between runs
function mcRun(d,N,job,onProg){
  const r=realRet(d), vol=n(d.assume.volatility)/100;
  const rand=rng(20261023), gauss=()=>{let u=0,v=0;while(!u)u=rand();while(!v)v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  const runs=[]; let i=0;
  return new Promise(res=>{(function chunk(){
    if(job!==mc.job) return res(null);
    const t0=performance.now();
    while(i<N&&performance.now()-t0<40){
      const rets=Array.from({length:80},()=>Math.max(-0.6,r+vol*gauss()));
      const s=simulate(d,rets); runs.push({totals:s.rows.map(x=>x.total),short:s.firstShort===null?null:s.rows[s.firstShort].year,estate:s.estate}); i++;
    }
    if(onProg) onProg(i/N);
    if(i<N) setTimeout(chunk,0); else res(runs);
  })();});
}
const okShare=runs=>runs.filter(x=>x.short===null).length/runs.length;
function pct(arr,p){const a=arr.slice().sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*(a.length-1)))];}
function quickMC(d,N){
  const r=realRet(d), vol=n(d.assume.volatility)/100, rand=rng(20261023);
  const g=()=>{let u=0,v=0;while(!u)u=rand();while(!v)v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  let ok=0; for(let i=0;i<N;i++){const rets=Array.from({length:80},()=>Math.max(-0.6,r+vol*g())); if(simulate(d,rets).firstShort===null) ok++;}
  return Math.round(ok/N*100);
}

export {realRet,retYearOf,rng,mc,mcRun,okShare,pct,quickMC};
