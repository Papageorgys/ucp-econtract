// deno run -A supabase/functions/_shared/rules_test.ts
import { nameMatch, runChecks, recommend } from "./rules.ts";
const eq=(a:unknown,b:unknown,m:string)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(m+": "+JSON.stringify(a)); };
eq(nameMatch("ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ","Γεώργιος Παπαδόπουλος").ok,true,"greek order/accents");
eq(nameMatch("Georgios Papadopoulos","Γεώργιος Παπαδόπουλος").ok,true,"latin vs greek");
eq(nameMatch("Μαρία Παπαδοπούλου","Γεώργιος Παπαδόπουλος").ok,false,"different person");
const f={issuer:{value:"Supplier",confidence:.95},customer_name:{value:"ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ",confidence:.93},supply_point:{value:"1 23456789 01 2",confidence:.97},address:{value:"Λεωφ. Κηφισίας 10",confidence:.9},issue_date:{value:new Date(Date.now()-20*864e5).toISOString().slice(0,10),confidence:.92},period_end:{value:null,confidence:0}};
const c=runChecks("SUPPLY",f,{kyc_name:"Γεώργιος Παπαδόπουλος",supply_point:"123456789012"});
eq(c.map(x=>x.ok),[true,true,true],"supply checks");
eq(recommend("SUPPLY",f,c).recommendation,"auto_approve","optional null field does not block");
const f2={...f,period_end:{value:"2026-08-31",confidence:.91}};
eq(recommend("SUPPLY",f2,c).recommendation,"auto_approve","all good -> auto");
const c2=runChecks("SUPPLY",{...f2,supply_point:{value:"999",confidence:.9}},{kyc_name:"Γεώργιος Παπαδόπουλος",supply_point:"123456789012"});
eq(recommend("SUPPLY",f2,c2).recommendation,"human","failed check -> human");
import { addrMatch } from "./rules.ts";
eq(addrMatch("Οδός Παραδείγματος 12, 11524","Odos Paradeigmatos 12 11524"),true,"address greek/latin with number");
eq(addrMatch("Λεωφ. Κηφισίας 10","Kifisias 12"),false,"address number mismatch");
eq(addrMatch("Odos 1, 11524","Odos 1, 11524"),true,"identical short address");
console.log("rules ok");
