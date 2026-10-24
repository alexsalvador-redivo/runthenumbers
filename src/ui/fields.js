import {CPP_MAX_65} from "../engine/benefits.js";

const PEOPLE_FIELDS = [
  ["g","Basics"],
  ["name","Name","text"],
  ["birthYear","Birth year","int"],
  ["retireAge","Retirement age","int"],
  ["lifeAge","Plan to age","int","life expectancy. Try different ages for each"],
  ["salary","Salary","$","per year before tax, until retiring"],
  ["g","Savings today"],
  ["rrsp","RRSP / RRIF","$"],
  ["tfsa","TFSA","$"],
  ["nonreg","Non-registered","$"],
  ["rrspContrib","RRSP contributions","$","per year, until retiring"],
  ["tfsaContrib","TFSA contributions","$","per year, until retiring"],
  ["tfsaRoom","Unused TFSA room","$","today, from CRA My Account"],
  ["g","Pensions"],
  ["pension","Workplace pension","$","per year before tax, indexed"],
  ["pensionStart","Pension starts at age","int"],
  ["survPct","Pension to survivor","%","share of the pension that continues after death"],
  ["cpp65","CPP / QPP at 65, monthly","$","from My Service Canada. 2026 max is $"+CPP_MAX_65.toLocaleString("en-CA")],
  ["cppStart","Start CPP at age","int","60 to 70"],
  ["oasYears","Years in Canada after 18","int","40 years gets full OAS"],
  ["oasStart","Start OAS at age","int","65 to 70"]
];
const HOUSE_FIELDS = [
  ["province","Province or territory","prov","where you'll live in retirement"],
  ["g","Spending"],
  ["spending","Household spending","$","per year, not counting mortgage"],
  ["spendingLater","Spending later in retirement","$","per year"],
  ["spendingChangeAge","Switch at age","int","@0"],
  ["survivorSpend","Spending for one","%","of the couple's spending, after a spouse dies"],
  ["cash","Cash and savings accounts","$"],
  ["g","Home and debt"],
  ["homeValue","Home value","$"],
  ["mortgage","Mortgage / HELOC balance","$"],
  ["mortgageRate","Interest rate","%"],
  ["mortgagePayment","Payments","$","per year"],
  ["downsizeAge","Downsize at age","int","@0 — 0 means never"],
  ["downsizeAmount","Equity released","$","today's dollars, after costs"],
  ["g","Long-term care"],
  ["ltcCost","Care cost per person","$","per year, on top of regular spending. 0 turns it off"],
  ["ltcAge","Care starts at age","int","each spouse's own age"]
];
const ASSUME_FIELDS = [
  ["returnRate","Investment return","%","average per year"],
  ["flexCut","Cut spending after a down year","%","in retirement, the year after markets fall. 0 turns it off"],
  ["volatility","Return volatility","%","how much returns swing year to year. About 10% for a balanced portfolio, 15% for all stocks"],
  ["cashRate","Cash return","%"],
  ["inflation","Inflation","%"],
  ["split","Split pension income","yesno","moves up to half of eligible pension income to the lower-income spouse"],
  ["cppShare","Share CPP between spouses","yesno","evens out your CPP pensions once you both collect"],
  ["cppShareYears","Careers spent together","%","share of your working years you were together"],
  ["order","Withdraw in this order","select"],
  ["g","RRSP drawdown"],
  ["meltTarget","Draw RRSP up to this income","$","taxable income per person, each year after retiring. 0 turns it off"],
  ["meltEnd","Through age","int","RRIF minimums take over from 72"]
];

export {PEOPLE_FIELDS,HOUSE_FIELDS,ASSUME_FIELDS};
