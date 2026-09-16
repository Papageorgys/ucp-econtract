// White-label configuration. Set as function secrets; every default is generic.
export const BRAND = {
  name:      Deno.env.get("BRAND_NAME")        ?? "Utility",          // shown in the UI header and SMS
  supplier:  Deno.env.get("SUPPLIER_LEGAL")    ?? "The Supplier",     // legal entity on the contract
  support:   Deno.env.get("SUPPORT_PHONE")     ?? "",                 // customer support line
  eid:       Deno.env.get("EID_NAME")          ?? "e-ID Wallet",      // national identity wallet label (e.g. gov.gr Wallet)
  grid:      Deno.env.get("GRID_OPERATOR")     ?? "the grid operator",// DSO name for customer copy
  taxIdLabel:Deno.env.get("TAX_ID_LABEL")      ?? "Tax ID",
  locale:    Deno.env.get("DEFAULT_LOCALE")    ?? "el",
};
