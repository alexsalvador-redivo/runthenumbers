const EXAMPLE = {
  people:[
    {name:"Spouse 1",birthYear:1968,retireAge:62,lifeAge:87,salary:118000,rrsp:420000,tfsa:95000,nonreg:60000,rrspContrib:15000,tfsaContrib:7000,tfsaRoom:20000,pension:0,pensionStart:65,survPct:60,cpp65:1150,cppStart:65,oasYears:40,oasStart:65},
    {name:"Spouse 2",birthYear:1970,retireAge:60,lifeAge:94,salary:82000,rrsp:210000,tfsa:88000,nonreg:0,rrspContrib:8000,tfsaContrib:7000,tfsaRoom:15000,pension:18000,pensionStart:60,survPct:60,cpp65:900,cppStart:65,oasYears:40,oasStart:65}
  ],
  house:{province:"BC",cash:30000,spending:90000,spendingLater:75000,spendingChangeAge:78,survivorSpend:70,homeValue:1400000,mortgage:180000,mortgageRate:4.5,mortgagePayment:24000,downsizeAge:0,downsizeAmount:0,ltcCost:0,ltcAge:85,
    events:[{label:"Replace the car",kind:"expense",amount:40000,age:63,every:10,until:83,who:"0"},{label:"New roof",kind:"expense",amount:25000,age:70,every:0,until:0,who:"0"}]},
  assume:{returnRate:5.5,cashRate:2.5,inflation:2.5,volatility:10,flexCut:0,split:"yes",cppShare:"no",cppShareYears:100,order:"cash,nonreg,rrsp,tfsa",meltTarget:0,meltEnd:71}
};
const ORDERS = [
  ["cash,nonreg,rrsp,tfsa","Cash → Non-reg → RRSP → TFSA"],
  ["cash,rrsp,nonreg,tfsa","Cash → RRSP → Non-reg → TFSA"],
  ["cash,nonreg,tfsa,rrsp","Cash → Non-reg → TFSA → RRSP"]
];
// People in the plan: just the first for a single person
const isSingle=d=>d.house.mode==="single";
const ppl=d=>isSingle(d)?d.people.slice(0,1):d.people;
const COUPLE_ONLY=new Set(["survivorSpend","split","cppShare","cppShareYears","survPct"]);
const bothPhrase=d=>isSingle(d)?"you retire":"you both retire";

export {EXAMPLE,ORDERS,isSingle,ppl,COUPLE_ONLY,bothPhrase};
