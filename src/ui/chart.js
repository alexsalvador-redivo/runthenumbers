import {last} from "./results.js";
import {esc,full,money} from "./format.js";
import {ppl} from "../engine/plan.js";
import {clamp,n} from "../engine/util.js";
import {mcData} from "./risk.js";
import {pct} from "../engine/montecarlo.js";

/* ---------- chart ---------- */
const canvas=document.getElementById("chart"), box=document.getElementById("chartBox"), tip=document.getElementById("tip");
let geom=null;
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function niceMax(v){if(v<=0)return 100000;const p=Math.pow(10,Math.floor(Math.log10(v)));const m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p;}
function drawChart(hoverIdx){
  if(!last) return;
  const {res,d}=last, rows=res.rows; if(!rows.length) return;
  const dpr=window.devicePixelRatio||1, W=box.clientWidth, Ht=box.clientHeight;
  canvas.width=W*dpr; canvas.height=Ht*dpr; const c=canvas.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,W,Ht);
  const L=54,R=12,T=10,B=40, w=W-L-R, h=Ht-T-B;
  const keys=["rrsp","tfsa","nonreg","cash"], cols={rrsp:css("--s-rrsp"),tfsa:css("--s-tfsa"),nonreg:css("--s-nonreg"),cash:css("--s-cash")};
  const ymax=niceMax(Math.max(...rows.map(r=>r.total))*1.05);
  const X=i=>L+(rows.length===1?0:i*w/(rows.length-1)), Y=v=>T+h-(v/ymax)*h;
  c.font="11px "+css("--f-num"); c.fillStyle=css("--muted"); c.strokeStyle=css("--line"); c.lineWidth=1;
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=Math.round(Y(v))+.5; c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke(); c.textAlign="right";c.textBaseline="middle";c.fillText(money(v),L-8,y);}
  // stacked areas
  let base=rows.map(()=>0);
  keys.forEach(k=>{
    const top=rows.map((r,i)=>base[i]+Math.max(0,r.bal[k]));
    c.beginPath(); rows.forEach((r,i)=>{const x=X(i),y=Y(top[i]); i?c.lineTo(x,y):c.moveTo(x,y);});
    for(let i=rows.length-1;i>=0;i--) c.lineTo(X(i),Y(base[i]));
    c.closePath(); c.fillStyle=cols[k]; c.globalAlpha=.85; c.fill(); c.globalAlpha=1;
    base=top;
  });
  // x labels: year + spouse 1 age
  c.textAlign="center"; c.textBaseline="top"; c.fillStyle=css("--muted");
  const step=Math.max(1,Math.ceil(rows.length/(w/62)));
  // the last year is labelled too when there's room; labels are kept inside the chart on narrow screens
  const lastTick=Math.floor((rows.length-1)/step)*step, half=c.measureText("age 00").width/2+2;
  rows.forEach((r,i)=>{ if(i%step===0||i===rows.length-1 && X(i)-X(lastTick)>=56){ const x=Math.min(X(i),W-half); c.fillText(String(r.year),x,T+h+6); c.fillText("age "+r.ages[0],x,T+h+20);} });
  // retirement lines
  c.setLineDash([4,4]); c.strokeStyle=css("--fg"); c.globalAlpha=.45;
  ppl(d).forEach(p=>{const i=rows.findIndex(r=>r.year===n(p.birthYear)+n(p.retireAge)); if(i>0){c.beginPath();c.moveTo(X(i)+.5,T);c.lineTo(X(i)+.5,T+h);c.stroke();}});
  c.setLineDash([1,4]); c.lineWidth=2; c.globalAlpha=.6;
  rows.forEach((r,i)=>{ if(i>0&&!r.alive.every(Boolean)&&rows[i-1].alive.every(Boolean)){c.beginPath();c.moveTo(X(i)+.5,T);c.lineTo(X(i)+.5,T+h);c.stroke();} });
  c.setLineDash([]); c.globalAlpha=1; c.lineWidth=1;
  // shortfall marker
  if(res.firstShort!==null){const x=X(res.firstShort); c.strokeStyle=css("--bad"); c.lineWidth=2; c.beginPath();c.moveTo(x,T);c.lineTo(x,T+h);c.stroke();
    c.fillStyle=css("--bad"); c.font="600 11px "+css("--f-body"); c.textAlign=x>L+w-90?"right":"left"; c.textBaseline="top"; c.fillText("Runs short",x+(x>L+w-90?-6:6),T+2);}
  if(hoverIdx!=null){c.strokeStyle=css("--fg");c.lineWidth=1;c.beginPath();c.moveTo(X(hoverIdx)+.5,T);c.lineTo(X(hoverIdx)+.5,T+h);c.stroke();}
  geom={L,w,n:rows.length,X};
}
function onMove(e){
  if(!geom||!last) return;
  const rect=canvas.getBoundingClientRect(), x=e.clientX-rect.left;
  const i=clamp(Math.round((x-geom.L)/geom.w*(geom.n-1)),0,geom.n-1), r=last.res.rows[i];
  drawChart(i);
  const names=ppl(last.d).map(p=>p.name);
  tip.innerHTML="<b>"+r.year+" · "+names.map((nm,i)=>esc(nm)+" "+r.ages[i]).join(", ")+"</b>"+
    [["RRSP / RRIF",r.bal.rrsp],["TFSA",r.bal.tfsa],["Non-reg",r.bal.nonreg],["Cash",r.bal.cash],["Total",r.total]].map(a=>"<div><span>"+a[0]+"</span><span class=\"num\">"+full(a[1])+"</span></div>").join("")+
    (r.short>0?"<div style=\"color:var(--bad)\"><span>Shortfall</span><span class=\"num\">"+full(r.short)+"</span></div>":"");
  tip.hidden=false;
  const tx=geom.X(i); tip.style.left=(tx>rect.width/2? tx-tip.offsetWidth-12 : tx+12)+"px"; tip.style.top="8px";
}
canvas.addEventListener("pointermove",onMove);
canvas.addEventListener("pointerleave",()=>{tip.hidden=true;drawChart();});
new ResizeObserver(()=>drawChart()).observe(box);
try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>drawChart());}catch(e){}
new MutationObserver(()=>{drawChart();if(typeof drawMC==="function")drawMC();}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
function drawMC(){
  if(!mcData||document.getElementById("mcOut").hidden) return;
  const cv=document.getElementById("mcChart"), bx=cv.parentElement, dpr=window.devicePixelRatio||1, W=bx.clientWidth, Ht=bx.clientHeight;
  cv.width=W*dpr; cv.height=Ht*dpr; const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,Ht);
  const {runs,years,ages}=mcData, L=54,R=12,T=8,B=38,w=W-L-R,h=Ht-T-B, m=years.length;
  const at=(k,p)=>pct(runs.map(x=>x.totals[k]||0),p);
  const lo=years.map((_,k)=>at(k,.1)), med=years.map((_,k)=>at(k,.5)), hi=years.map((_,k)=>at(k,.9));
  const ymax=niceMax(Math.max(...hi)*1.05), X=k=>L+(m===1?0:k*w/(m-1)), Y=v=>T+h-(v/ymax)*h;
  c.font="11px "+css("--f-num"); c.fillStyle=css("--muted"); c.strokeStyle=css("--line");
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke();c.textAlign="right";c.textBaseline="middle";c.fillText(money(v),L-8,y);}
  c.beginPath(); hi.forEach((v,k)=>k?c.lineTo(X(k),Y(v)):c.moveTo(X(k),Y(v))); for(let k=m-1;k>=0;k--)c.lineTo(X(k),Y(lo[k])); c.closePath();
  c.fillStyle=css("--accent"); c.globalAlpha=.18; c.fill(); c.globalAlpha=1;
  c.beginPath(); med.forEach((v,k)=>k?c.lineTo(X(k),Y(v)):c.moveTo(X(k),Y(v))); c.strokeStyle=css("--accent"); c.lineWidth=2; c.stroke(); c.lineWidth=1;
  c.textAlign="center"; c.textBaseline="top"; c.fillStyle=css("--muted");
  const step=Math.max(1,Math.ceil(m/(w/62)));
  years.forEach((yr,k)=>{ if(k%step===0){c.fillText(String(yr),X(k),T+h+6);c.fillText("age "+ages[k],X(k),T+h+20);} });
}
new ResizeObserver(()=>drawMC()).observe(document.getElementById("mcChart").parentElement);
// Chart drawn with a fixed light palette so it prints the same in any theme
function chartImage(rows,d,W,H){
  const c=document.createElement("canvas"); c.width=W*2; c.height=H*2; const g=c.getContext("2d"); g.scale(2,2);
  g.fillStyle="#ffffff"; g.fillRect(0,0,W,H);
  const L=62,R=12,T=12,B=40,w=W-L-R,h=H-T-B, keys=["rrsp","tfsa","nonreg","cash"], col={rrsp:"#3166a8",tfsa:"#1f8f6c",nonreg:"#c48a2a",cash:"#8679b6"};
  const ymax=niceMax(Math.max(1,...rows.map(r=>r.total))*1.05), X=i=>L+(rows.length===1?0:i*w/(rows.length-1)), Y=v=>T+h-(v/ymax)*h;
  g.font="11px Helvetica, Arial, sans-serif"; g.strokeStyle="#dbe2df"; g.fillStyle="#5a6a65"; g.lineWidth=1;
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=Math.round(Y(v))+.5; g.beginPath(); g.moveTo(L,y); g.lineTo(L+w,y); g.stroke(); g.textAlign="right"; g.textBaseline="middle"; g.fillText(money(v),L-8,y);}
  let base=rows.map(()=>0);
  keys.forEach(k=>{const top=rows.map((r,i)=>base[i]+Math.max(0,r.bal[k])); g.beginPath(); rows.forEach((r,i)=>i?g.lineTo(X(i),Y(top[i])):g.moveTo(X(i),Y(top[i]))); for(let i=rows.length-1;i>=0;i--) g.lineTo(X(i),Y(base[i])); g.closePath(); g.fillStyle=col[k]; g.globalAlpha=.85; g.fill(); g.globalAlpha=1; base=top;});
  g.fillStyle="#5a6a65"; g.textAlign="center"; g.textBaseline="top"; const step=Math.max(1,Math.ceil(rows.length/9));
  rows.forEach((r,i)=>{ if(i%step===0){g.fillText(String(r.year),X(i),T+h+6); g.fillText("age "+r.ages[0],X(i),T+h+20);} });
  g.setLineDash([4,4]); g.strokeStyle="#16201d"; g.globalAlpha=.4;
  ppl(d).forEach(p=>{const i=rows.findIndex(r=>r.year===n(p.birthYear)+n(p.retireAge)); if(i>0){g.beginPath(); g.moveTo(X(i)+.5,T); g.lineTo(X(i)+.5,T+h); g.stroke();}});
  g.setLineDash([]); g.globalAlpha=1;
  return c.toDataURL("image/png");
}

export {drawChart,chartImage,drawMC};
