const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const n = v => (isFinite(+v) ? +v : 0);
const clone = o => JSON.parse(JSON.stringify(o));

export {clamp,n,clone};
