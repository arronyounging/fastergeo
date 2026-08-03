/**
 * @fastergeo/commerce — product-level GEO.
 *
 * The commerce question is not "does AI mention my brand" but "when a buyer
 * asks, does AI recommend MY product, at the RIGHT price, with a link" —
 * and its dark twin: "is AI quoting a price I never set". A wrong price in
 * an AI answer is the commerce version of brand confusion: a deterministic,
 * evidence-quotable P0.
 *
 * v1 is fully deterministic (name matching + price extraction) — no LLM
 * needed to prove a wrong price when the evidence sentence is attached.
 */

export interface Product {
  id: string;
  name: string;
  /** Aliases and short names buyers/AI actually use. */
  aliases?: string[];
  url: string;
  /** Numeric price; null when genuinely unknown — never 0 as placeholder. */
  price: number | null;
  /** ISO 4217; null when the source (e.g. Shopify products.json) omits it. */
  currency: string | null;
  category?: string;
}

export interface CatalogWarning {
  url?: string;
  message: string;
}

export interface Catalog {
  source: 'jsonld' | 'shopify' | 'manual';
  fetchedAt: string;
  products: Product[];
  /** Extraction problems, named — a product page without Product JSON-LD
   * is itself a commerce-GEO finding. */
  warnings: CatalogWarning[];
}

/** Per-product verdict for one sampled answer. Deterministic only. */
export type PriceVerdict = 'correct-price' | 'wrong-price' | 'no-price-quoted' | 'not-mentioned';

export interface ProductSampleCheck {
  productId: string;
  verdict: PriceVerdict;
  /** Amounts found near the mention when verdict is wrong-price. */
  foundAmounts?: number[];
  /** The mention sentence, quoted — required for wrong-price. */
  evidence?: string;
}

export interface ProductPlatformStats {
  productId: string;
  name: string;
  /** Unprompted samples where this product was mentioned. */
  mentions: number;
  priceChecks: {
    correct: number;
    wrong: number;
    /** Mentioned but no price quoted nearby. */
    none: number;
  };
  /** Evidence sentences for every wrong-price finding — each is a P0 lead. */
  wrongPriceEvidence: string[];
}

export interface ShoppingPlatform {
  providerId: string;
  market: 'cn' | 'global';
  samples: number;
  /** Share of samples mentioning ANY own product. */
  anyProductMentionRate: number | null;
  products: ProductPlatformStats[];
}

export interface ShoppingReport {
  generatedAt: string;
  brand: string;
  totalSamples: number;
  platforms: ShoppingPlatform[];
}
