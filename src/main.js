// Run The Numbers: entry point. Loads the styles and every screen, then shows the quick start.
import "./fonts.css";
import "./styles.css";
import {TD} from "./engine/benefits.js";
import {esc} from "./ui/format.js";
import {renderTabs} from "./ui/scenarios.js";
import {buildForm} from "./ui/form.js";
import {render} from "./ui/results.js";
import {showQuick} from "./ui/quickstart.js";
import "./ui/report.js";

(function(){ const el=document.getElementById("dataSrc"), nr=(TD.needsReview||[]).length;
  el.innerHTML='<span class="chip-ok">✓ Synced from Airtable</span> Tax figures verified '+esc(new Date(TD.verified+"T12:00:00").toLocaleDateString("en-CA",{year:"numeric",month:"long",day:"numeric"}))+
    ': 14 jurisdictions, '+Object.values(TD.prov).reduce((s,p)=>s+p.br.length,TD.fed.br.length)+' tax brackets, '+Object.keys(TD.benefits).length+' benefit figures.'+(nr?' '+nr+' item'+(nr>1?'s':'')+' still marked for review.':'');
})();
renderTabs(); buildForm(); render();
showQuick(true);

// Golden tests only (vite build --mode golden). Removed from the published app at build time.
if(import.meta.env.MODE==="golden") import("./golden-hooks.js");
