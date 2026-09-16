// deno run -A supabase/functions/_shared/offers_test.ts
import { offersFor, applyOffer } from "./offers.ts";
import { activeBlocks } from "./blocks.ts";
const eq=(a:unknown,b:unknown,m:string)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(m+": "+JSON.stringify(a)); };
const base={ journey:"electricity", kyc:{method:"eid",assurance:"substantial" as const}, products:["EL-STD"], fiber_serviceable:true, offers:[] as {offer_id:string;shown:number;decision:"accepted"|"declined"|null}[] };
eq(offersFor(base,"after_eligibility").map(o=>o.id),["XS-FIBER"],"fiber cross-sell when serviceable");
eq(offersFor({...base,fiber_serviceable:false},"after_eligibility").map(o=>o.id),[],"no cross-sell without coverage");
eq(offersFor(base,"after_product").map(o=>o.id),["UP-EL-FIX","AD-NIGHT"],"upsell + electricity add-on");
const up=offersFor(base,"after_product")[0]; eq(applyOffer(base.products,up),["EL-FIX12"],"upsell replaces");
const withFiber=applyOffer(base.products,offersFor(base,"after_eligibility")[0]); eq(withFiber,["EL-STD","FB-500"],"cross-sell appends");
eq(offersFor({...base,products:withFiber},"after_product").map(o=>o.id),["UP-FB-1000","UP-EL-FIX","AD-NIGHT","AD-WIFI"],"both families → both upsells and add-ons");
eq(offersFor({...base,offers:[{offer_id:"AD-NIGHT",shown:1,decision:"declined"}]},"after_product").map(o=>o.id),["UP-EL-FIX"],"declined offers do not return");
eq(offersFor(base,"post_signature").map(o=>o.id),["AD-EV"],"post-signature add-on");
eq(activeBlocks(base as never),["identity","eligibility","offers_1","product","offers_2","customer","documents","payment","contract","activation","offers_3"],"block order electricity");
eq(activeBlocks({journey:"fiber",kyc:{method:"eid"},products:["FB-500"]} as never),["identity","eligibility","product","offers_2","customer","payment","contract","activation","offers_3"],"fiber: no offers_1, no documents");
eq(activeBlocks({journey:"fiber",kyc:{method:"manual"},products:["FB-500"]} as never).includes("documents"),true,"manual identity adds documents block");
console.log("offers ok");
