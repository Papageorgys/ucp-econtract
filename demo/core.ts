(globalThis as any).Deno ??= { env: { get: () => undefined } };
import { BLOCKS, activeBlocks, blockById, SLOT_OF_BLOCK } from "../supabase/functions/_shared/blocks.ts";
import { offersFor } from "../supabase/functions/_shared/offers.ts";
import { PRODUCTS, BUNDLES, requiredDocs, CATALOGUE_VERSION } from "../supabase/functions/_shared/catalogue.ts";
import { runChecks, recommend } from "../supabase/functions/_shared/rules.ts";
import { randomId, randomToken } from "../supabase/functions/_shared/crypto.ts";
(globalThis as any).CORE = { BLOCKS, activeBlocks, blockById, SLOT_OF_BLOCK, offersFor, PRODUCTS, BUNDLES, requiredDocs, CATALOGUE_VERSION, runChecks, recommend, randomId, randomToken };
