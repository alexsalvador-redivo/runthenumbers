import {active} from "../storage.js";
import {simulate} from "../engine/simulate.js";
import {COUPLE_ONLY,ORDERS,bothPhrase,isSingle,ppl} from "../engine/plan.js";
import {START_YEAR,TODAY} from "../engine/dates.js";
import {PROV} from "../engine/tax.js";
import {takeaways} from "./results.js";
import {okShare,quickMC,realRet,retYearOf} from "../engine/montecarlo.js";
import {clamp,n} from "../engine/util.js";
import {full,money,tick} from "./format.js";
import {mcData} from "./risk.js";
import {chartImage} from "./chart.js";
import {ASSUME_FIELDS,HOUSE_FIELDS,PEOPLE_FIELDS} from "./fields.js";

/* ---------- PDF report ---------- */
// jsPDF and its table plugin are bundled with the app but only downloaded when someone builds a report
const loadPdf=async()=>{ try{ const [{jsPDF},{applyPlugin}]=await Promise.all([import("jspdf"),import("jspdf-autotable")]); applyPlugin(jsPDF); return jsPDF; }catch(e){ throw new Error("load"); } };
const pdfTxt=t=>String(t).replace(/→/g,">").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,"...").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—]/g,"");
// A normal browser download: the file goes straight to the visitor's device, nothing is uploaded
function saveFile(blob,filename){
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function makeReport(){
  const btn=document.getElementById("btnReport"), msg=document.getElementById("reportMsg");
  btn.disabled=true; const label=btn.textContent; btn.textContent="Building report…"; msg.textContent="";
  try{
    const jsPDF=await loadPdf(), s=active(), d=s.data, res=simulate(d), rows=res.rows, P=ppl(d), names=P.map(p=>p.name);
    const doc=new jsPDF({unit:"pt",format:"letter"}), PW=doc.internal.pageSize.getWidth(), M=48; let y=M;
    const ink=[22,32,29], mute=[90,106,101], acc=[28,106,84];
    const para=(t,size=10,color=ink,gap=4)=>{doc.setFont("helvetica","normal"); doc.setFontSize(size); doc.setTextColor(...color); const ls=doc.splitTextToSize(pdfTxt(t),PW-2*M); if(y+ls.length*size*1.3>760){doc.addPage(); y=M;} doc.text(ls,M,y); y+=ls.length*size*1.3+gap;};
    const head=t=>{if(y>700){doc.addPage(); y=M;} doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...acc); doc.text(pdfTxt(t),M,y); y+=18;};
    const today=TODAY.toLocaleDateString("en-CA",{year:"numeric",month:"long",day:"numeric"});
    // title
    doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(...ink); doc.text("Retirement plan summary",M,y); y+=22;
    para((isSingle(d)?names[0]:names.join(" and "))+" - "+PROV[d.house.province||"BC"].name+" - plan \""+s.name+"\"",11,mute,2);
    para("Prepared "+today+" with Run The Numbers. All amounts are in today's dollars"+(s.example?". NOTE: these are the calculator's example figures, not real ones.":"."),9,mute,12);
    // verdict
    const ok=res.firstShort===null;
    doc.setFillColor(...(ok?[223,240,230]:[246,227,223])); const vb=pdfTxt(document.getElementById("vBig").textContent), vt=doc.splitTextToSize(pdfTxt(document.getElementById("vText").textContent),PW-2*M-24);
    const bh=40+vt.length*13; doc.roundedRect(M,y,PW-2*M,bh,6,6,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...(ok?[29,122,82]:[176,65,44])); doc.text(vb,M+12,y+22);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(...ink); doc.text(vt,M+12,y+38); y+=bh+14;
    head("Key points");
    takeaways(d,res).forEach(x=>para(x.k+". "+x.t.replace(/ Try “Find my best plan”.*$/,"").replace(/ “Find my best plan” can test combinations\.$/,""),10,ink,5));
    y+=4; head("Key numbers");
    const retYear=retYearOf(d), rr=rows.find(x=>x.year===retYear-1)||rows[0];
    const r0=realRet(d), k0=clamp(retYear-START_YEAR,0,Math.max(0,rows.length-1)), rets=Array(80).fill(r0); rets[k0]=-0.25; const st=simulate(d,rets);
    btn.textContent="Running market histories…"; await tick();
    const mcPct=mcData?Math.round(okShare(mcData.runs)*100)+"% of 500":quickMC(d,200)+"% of 200";
    doc.autoTable({startY:y,margin:{left:M,right:M},theme:"plain",styles:{fontSize:10,cellPadding:4,textColor:ink},columnStyles:{1:{halign:"right",fontStyle:"bold"}},
      body:[["Investments when "+bothPhrase(d),money(rr.total)],["Lifetime income tax incl. OAS clawback",money(res.lifeTax)],["OAS clawback over the plan",money(res.lifeClaw)],
        ["Estate after tax at end of plan (incl. home)",money(res.estate)],["Market histories where the money lasts",mcPct],
        ["If markets fall 25% in "+(START_YEAR+k0),st.firstShort===null?"Still lasts":"Runs short in "+st.rows[st.firstShort].year]].map(r=>r.map(pdfTxt))});
    y=doc.lastAutoTable.finalY+14;
    head("Investments over time");
    const img=chartImage(rows,d,640,260); if(y+220>760){doc.addPage(); y=M;} doc.addImage(img,"PNG",M,y,PW-2*M,(PW-2*M)*260/640); y+=(PW-2*M)*260/640+6;
    para("Blue: RRSP/RRIF. Green: TFSA. Gold: non-registered. Purple: cash. Dashed lines: retirement. Home equity not shown.",8,mute,10);
    // inputs
    doc.addPage(); y=M; head("Plan inputs");
    const val=(type,v)=>type==="$"?full(n(v)):type==="%"?n(v)+"%":type==="yesno"?(v==="no"?"No":"Yes"):type==="select"?(ORDERS.find(o=>o[0]===v)||[,v])[1]:type==="prov"?PROV[v||"BC"].name:String(v??"");
    const pr=PEOPLE_FIELDS.filter(f=>f[0]!=="g"&&f[0]!=="name"&&!(isSingle(d)&&COUPLE_ONLY.has(f[0]))).map(f=>[f[1],...P.map(p=>val(f[2],p[f[0]]))]);
    doc.autoTable({startY:y,margin:{left:M,right:M},head:[["",...names]],body:pr.map(r=>r.map(pdfTxt)),theme:"striped",styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:acc},columnStyles:{1:{halign:"right"},2:{halign:"right"}}});
    y=doc.lastAutoTable.finalY+14;
    const hr=[...HOUSE_FIELDS,...ASSUME_FIELDS].filter(f=>f[0]!=="g"&&!(isSingle(d)&&COUPLE_ONLY.has(f[0]))).map(f=>[f[1],val(f[2],(HOUSE_FIELDS.includes(f)?d.house:d.assume)[f[0]])]);
    doc.autoTable({startY:y,margin:{left:M,right:M},head:[["Household and assumptions",""]],body:hr.map(r=>r.map(pdfTxt)),theme:"striped",styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:acc},columnStyles:{1:{halign:"right"}}});
    y=doc.lastAutoTable.finalY+14;
    if((d.house.events||[]).length){
      doc.autoTable({startY:y,margin:{left:M,right:M},head:[["Big expenses and windfalls","Type","Amount","When"]],theme:"striped",styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:acc},
        body:d.house.events.map(e=>[e.label||"Event",e.kind==="expense"?"Expense":e.kind==="free"?"Tax-free in":"Taxable income",full(n(e.amount)),"Age "+e.age+(n(e.every)?", every "+e.every+" yrs to "+e.until:"")].map(pdfTxt))});
      y=doc.lastAutoTable.finalY+14;
    }
    // year by year
    doc.addPage("letter","landscape"); y=M; head("Year by year (today's dollars)");
    doc.autoTable({startY:y,margin:{left:M-14,right:M-14},theme:"striped",styles:{fontSize:7.5,cellPadding:2.5,halign:"right"},headStyles:{fillColor:acc,halign:"right"},columnStyles:{0:{halign:"left"},1:{halign:"left"}},
      head:[["Year","Ages","Work pay","CPP","OAS","Pension","RRSP/RRIF out","TFSA/other out","Tax + clawback","Spending*","Shortfall","Investments","Home equity"]],
      body:rows.map(x=>[x.partial?x.year+" (rest)":x.year,x.ages.map((a,i)=>x.alive[i]?a:"-").join("/"),full(x.work),full(x.cpp),full(x.oas),full(x.pen),full(x.rrifMin+x.melt+x.wd.rrsp),full(x.wd.tfsa+x.wd.nonreg+x.wd.cash),full(x.tax+x.claw),full(x.spend+x.mortPay+x.evExp+x.ltc),full(x.short),full(x.total),full(x.homeEq)].map(c=>pdfTxt(String(c))))});
    y=doc.lastAutoTable.finalY+10;
    para("* Spending includes mortgage payments, big expenses and care costs.",8,mute,10);
    head("How this projection works");
    ["Taxes use 2026 federal and provincial brackets and credits, held constant in today's dollars, including the age, pension and Canada employment credits, OAS clawback, pension splitting"+(d.assume.cppShare==="yes"?", CPP sharing":"")+" and RRIF minimums.",
     "CPP and OAS are adjusted for the chosen start ages. When a spouse dies, registered accounts roll to the survivor, OAS stops and the CPP survivor's pension is added.",
     "Investment return "+n(d.assume.returnRate)+"%, inflation "+n(d.assume.inflation)+"%, volatility "+n(d.assume.volatility)+"%. Market histories replay the plan with randomized returns.",
     "Not modelled: tax on non-registered growth, GIS, low-income provincial tax reductions outside BC, and Quebec's health contribution.",
     "This is an educational projection, not financial advice. Please review it with a qualified, fee-only financial planner."].forEach(t=>para("- "+t,9,ink,3));
    const pages=doc.getNumberOfPages();
    for(let i=1;i<=pages;i++){doc.setPage(i); const pw=doc.internal.pageSize.getWidth(), ph=doc.internal.pageSize.getHeight(); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...mute);
      doc.text(pdfTxt("Run The Numbers - "+s.name+" - "+today),M-14,ph-24); doc.text("Page "+i+" of "+pages,pw-M+14,ph-24,{align:"right"});}
    const blob=doc.output("blob");
    const fname=pdfTxt("Retirement plan - "+s.name+" - "+TODAY.toISOString().slice(0,10)+".pdf").replace(/[\\/:*?"<>|]/g,"-");
    saveFile(blob,fname);
    msg.textContent="Report downloaded. You can attach it to an email to your advisor.";
  }catch(e){
    msg.textContent=e&&e.message==="load"?"Couldn't load the PDF tools. Check your connection and try again.":"Something went wrong building the report. Try again.";
  }finally{ btn.disabled=false; btn.textContent=label; }
}
document.getElementById("btnReport").onclick=makeReport;
