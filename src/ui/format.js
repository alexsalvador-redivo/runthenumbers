// Number and text formatting shared by the screens and the PDF report
const money=v=>{const a=Math.abs(v); const s=a>=1e6?(a/1e6).toFixed(2)+"M":a>=1e3?Math.round(a/1e3).toLocaleString("en-CA")+"k":Math.round(a).toString(); return (v<0?"−$":"$")+s;};
const full=v=>v?(v<0?"−":"")+"$"+Math.round(Math.abs(v)).toLocaleString("en-CA"):"–";
function esc(s){return s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
const tick=()=>new Promise(r=>setTimeout(r,0));

export {money,full,esc,tick};
