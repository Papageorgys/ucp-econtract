// Offer evaluation. Pure function of the application; the decision log lives in applications.offers.
import { OFFERS, PRODUCTS, familiesOf, assuranceOk, type OfferRule, type Assurance } from "./catalogue.ts";
export type AppLike = { journey: string; kyc?: { method?: string; assurance?: Assurance } | null; products: string[]; fiber_serviceable?: boolean | null };
export type OfferDecision = { offer_id: string; shown: number; decision: "accepted" | "declined" | null; at?: string };
export type Offer = { id: string; kind: OfferRule["kind"]; sku: string; replaces?: string; discount_rule?: string; headline_el: string; headline_en: string; product: (typeof PRODUCTS)[string] };

export function offersFor(a: AppLike & { offers?: OfferDecision[] | null }, slot: OfferRule["slot"]): Offer[] {
  const fams = familiesOf(a.products); const log = a.offers ?? []; const assurance = a.kyc?.assurance ?? "low";
  return OFFERS.filter((r) => r.slot === slot).filter((r) => {
    const w = r.when; const seen = log.find((d) => d.offer_id === r.id);
    if (seen && (seen.decision || seen.shown >= r.max_shows)) return false;
    if (w.journey && !w.journey.includes(a.journey as never)) return false;
    if (w.has_family && !w.has_family.every((f) => fams.has(f))) return false;
    if (w.not_family && w.not_family.some((f) => fams.has(f))) return false;
    if (w.has_sku && !w.has_sku.every((s) => a.products.includes(s))) return false;
    if (w.not_sku && w.not_sku.some((s) => a.products.includes(s))) return false;
    if (w.fiber_serviceable !== undefined && !!a.fiber_serviceable !== w.fiber_serviceable) return false;
    if (!assuranceOk([r.offer.sku], assurance)) return false;
    const p = PRODUCTS[r.offer.sku]; if (!p) return false;
    if (p.kind === "addon" && !p.attaches_to?.some((f) => fams.has(f))) return false;
    return true;
  }).map((r) => ({ id: r.id, kind: r.kind, sku: r.offer.sku, replaces: r.offer.replaces, discount_rule: r.offer.discount_rule, headline_el: r.headline_el, headline_en: r.headline_en, product: PRODUCTS[r.offer.sku] }));
}
// Applying an accepted offer to the product list. Upsell replaces; cross-sell and add-on append.
export function applyOffer(products: string[], o: Offer): string[] {
  const next = o.replaces ? products.map((p) => (p === o.replaces ? o.sku : p)) : [...products, o.sku];
  return [...new Set(next)];
}
