// Tax and benefit figures, built into the app from tax-data.json at build time.
// The visitor's browser never fetches them from anywhere.
// JSON can't hold Infinity, so each top bracket stores null for "no upper limit".
import raw from "./tax-data.json";

const brackets = br => br.map(([top, rate]) => [top === null ? Infinity : top, rate]);

export const TAX_DATA = {
  ...raw,
  fed: { ...raw.fed, br: brackets(raw.fed.br) },
  prov: Object.fromEntries(Object.entries(raw.prov).map(([code, p]) => [code, { ...p, br: brackets(p.br) }])),
};
