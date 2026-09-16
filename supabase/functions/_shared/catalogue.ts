import { BRAND } from "./brand.ts";
// Pillar 1 stub. Replace with a call to the catalogue service. Nothing outside this file may hard-code a product, price, or offer.
export const CATALOGUE_VERSION = "stub-2026-09.2";
export type Assurance = "low" | "substantial" | "high";
export type Product = { family: "electricity" | "fiber" | "addon"; kind: "core" | "addon"; name_el: string; name_en: string; price: string; unit: string;
  fixed_months: number; exit_el: string; legal: string; requires: string[]; min_assurance: Assurance; tier?: number; attaches_to?: ("electricity" | "fiber")[] };

export const PRODUCTS: Record<string, Product> = {
  "EL-STD":   { family: "electricity", kind: "core", name_el: "Ρεύμα Σπίτι",      name_en: "Home Standard", price: "0,000", unit: "€/kWh",  fixed_months: 0,  exit_el: "Χωρίς κόστος",             legal: "EL-T&C-v0", requires: ["SUPPLY", "OWNERSHIP"], min_assurance: "low", tier: 1 },
  "EL-FIX12": { family: "electricity", kind: "core", name_el: "Ρεύμα Σταθερό 12", name_en: "Home Fixed 12", price: "0,000", unit: "€/kWh",  fixed_months: 12, exit_el: "Τέλος πρόωρης αποχώρησης", legal: "EL-T&C-v0", requires: ["SUPPLY", "OWNERSHIP"], min_assurance: "low", tier: 2 },
  "FB-500":   { family: "fiber",       kind: "core", name_el: "Fiber 500",        name_en: "Fiber 500",     price: "0,00",  unit: "€/μήνα", fixed_months: 24, exit_el: "Τέλος πρόωρης αποχώρησης", legal: "FB-T&C-v0", requires: [],                     min_assurance: "low", tier: 1 },
  "FB-1000":  { family: "fiber",       kind: "core", name_el: "Fiber 1000",       name_en: "Fiber 1000",    price: "0,00",  unit: "€/μήνα", fixed_months: 24, exit_el: "Τέλος πρόωρης αποχώρησης", legal: "FB-T&C-v0", requires: [],                     min_assurance: "low", tier: 2 },
  "AD-NIGHT": { family: "addon", kind: "addon", name_el: "Νυχτερινό τιμολόγιο",   name_en: "Night tariff",      price: "0,00", unit: "€/μήνα", fixed_months: 0,  exit_el: "Χωρίς κόστος", legal: "AD-T&C-v0", requires: [], min_assurance: "low", attaches_to: ["electricity"] },
  "AD-EV":    { family: "addon", kind: "addon", name_el: "Φόρτιση EV στο σπίτι",   name_en: "Home EV charging",  price: "0,00", unit: "€/μήνα", fixed_months: 12, exit_el: "Τέλος πρόωρης αποχώρησης", legal: "AD-T&C-v0", requires: [], min_assurance: "low", attaches_to: ["electricity"] },
  "AD-WIFI":  { family: "addon", kind: "addon", name_el: "Mesh Wi-Fi",            name_en: "Mesh Wi-Fi",        price: "0,00", unit: "€/μήνα", fixed_months: 24, exit_el: "Τέλος πρόωρης αποχώρησης", legal: "AD-T&C-v0", requires: [], min_assurance: "low", attaches_to: ["fiber"] },
  "AD-TV":    { family: "addon", kind: "addon", name_el: "Τηλεόραση",             name_en: "TV",                price: "0,00", unit: "€/μήνα", fixed_months: 12, exit_el: "Τέλος πρόωρης αποχώρησης", legal: "AD-T&C-v0", requires: [], min_assurance: "low", attaches_to: ["fiber"] },
};
export const BUNDLES = { "BN-EL-FB": { components: ["EL-FIX12", "FB-500"], discount_rule: "BUNDLE-01", legal: "BN-TERMS-v0" } };
export const WITHDRAWAL = { days: 14, online_function: true, basis: "Directive 2023/2673 Art. 11a" };

// Offer rules. Evaluated by _shared/offers.ts at fixed slots. Adding a campaign = adding a row here (or in the catalogue service), not code.
export type OfferRule = { id: string; kind: "upsell" | "cross_sell" | "addon"; slot: "after_eligibility" | "after_product" | "post_signature";
  when: { has_family?: ("electricity" | "fiber")[]; not_family?: ("electricity" | "fiber")[]; has_sku?: string[]; not_sku?: string[]; fiber_serviceable?: boolean; journey?: ("electricity" | "fiber" | "bundle")[] };
  offer: { sku: string; replaces?: string; discount_rule?: string }; headline_el: string; headline_en: string; max_shows: number };
export const OFFERS: OfferRule[] = [
  { id: "UP-FB-1000",  kind: "upsell",     slot: "after_product",     when: { has_sku: ["FB-500"] },                       offer: { sku: "FB-1000", replaces: "FB-500" },          headline_el: "Διπλάσια ταχύτητα για λίγο παραπάνω", headline_en: "Double the speed for a little more", max_shows: 1 },
  { id: "UP-EL-FIX",   kind: "upsell",     slot: "after_product",     when: { has_sku: ["EL-STD"] },                       offer: { sku: "EL-FIX12", replaces: "EL-STD" },         headline_el: "Κλειδώστε την τιμή για 12 μήνες",      headline_en: "Lock the price for 12 months",       max_shows: 1 },
  { id: "XS-FIBER",    kind: "cross_sell", slot: "after_eligibility", when: { journey: ["electricity"], fiber_serviceable: true, not_family: ["fiber"] }, offer: { sku: "FB-500", discount_rule: "BUNDLE-01" }, headline_el: "Υπάρχει οπτική ίνα στη διεύθυνσή σας", headline_en: "Fiber is available at your address", max_shows: 1 },
  { id: "XS-ELEC",     kind: "cross_sell", slot: "after_product",     when: { journey: ["fiber"], not_family: ["electricity"] }, offer: { sku: "EL-FIX12", discount_rule: "BUNDLE-01" }, headline_el: "Προσθέστε ρεύμα με έκπτωση πακέτου", headline_en: "Add electricity with the bundle discount", max_shows: 1 },
  { id: "AD-NIGHT",    kind: "addon",      slot: "after_product",     when: { has_family: ["electricity"], not_sku: ["AD-NIGHT"] }, offer: { sku: "AD-NIGHT" }, headline_el: "Φθηνότερο ρεύμα τη νύχτα", headline_en: "Cheaper power at night", max_shows: 1 },
  { id: "AD-EV",       kind: "addon",      slot: "post_signature",    when: { has_family: ["electricity"], not_sku: ["AD-EV"] },    offer: { sku: "AD-EV" },    headline_el: "Έχετε ηλεκτρικό αυτοκίνητο;",       headline_en: "Own an electric car?",              max_shows: 1 },
  { id: "AD-WIFI",     kind: "addon",      slot: "after_product",     when: { has_family: ["fiber"], not_sku: ["AD-WIFI"] },       offer: { sku: "AD-WIFI" },  headline_el: "Κάλυψη Wi-Fi σε όλο το σπίτι",       headline_en: "Wi-Fi in every room",               max_shows: 1 },
  { id: "AD-TV",       kind: "addon",      slot: "post_signature",    when: { has_family: ["fiber"], not_sku: ["AD-TV"] },         offer: { sku: "AD-TV" },    headline_el: "Προσθέστε τηλεόραση",                headline_en: "Add TV",                            max_shows: 1 },
];

export function requiredDocs(products: string[], kyc?: { method?: string } | null): string[] {
  const s = new Set<string>(); if (kyc?.method === "manual") s.add("ID");
  for (const p of products) for (const d of PRODUCTS[p]?.requires ?? []) s.add(d); return [...s];
}
export const ASSURANCE_RANK: Record<Assurance, number> = { low: 0, substantial: 1, high: 2 };
export function assuranceOk(products: string[], assurance: Assurance) {
  return products.every((p) => ASSURANCE_RANK[assurance] >= ASSURANCE_RANK[PRODUCTS[p]?.min_assurance ?? "low"]);
}
export function familiesOf(products: string[]) { return new Set(products.map((p) => PRODUCTS[p]?.family).filter((f) => f === "electricity" || f === "fiber") as ("electricity" | "fiber")[]); }

// Canonical text is what gets hashed. Deterministic field order; no timestamps inside.
export function canonicalContract(app: { id: string; kyc: { name: string; afm: string } }, sku: string, bundle?: string) {
  const p = PRODUCTS[sku];
  return [
    `CONTRACT ${sku}`, `CATALOGUE ${CATALOGUE_VERSION}`, `APPLICATION ${app.id}`,
    `SUPPLIER ${BRAND.supplier}`, `PRODUCT ${p.name_el}`, `PRICE ${p.price} ${p.unit}`, `FIXED_MONTHS ${p.fixed_months}`, `EXIT ${p.exit_el}`,
    `LEGAL ${p.legal}${bundle ? " + " + BUNDLES[bundle as keyof typeof BUNDLES].legal : ""}`,
    `SIGNATORY ${app.kyc.name} AFM ${app.kyc.afm}`,
    `WITHDRAWAL ${WITHDRAWAL.days} DAYS ONLINE_FUNCTION ${WITHDRAWAL.online_function}`,
  ].join("\n");
}
