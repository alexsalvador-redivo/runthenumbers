// Projection starts today: the first year covers only what's left of this calendar year
const TODAY=new Date();
const FIRST_FRAC=(()=>{const end=new Date(TODAY.getFullYear(),11,31,23,59); return (end-TODAY)/(365.25*864e5);})();
const START_YEAR = FIRST_FRAC<1/12 ? TODAY.getFullYear()+1 : TODAY.getFullYear();
const F0 = FIRST_FRAC<1/12 ? 1 : Math.min(1,FIRST_FRAC);

export {TODAY,START_YEAR,F0};
