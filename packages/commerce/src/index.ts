export { extractJsonLdProducts, parseShopifyProducts } from './ingest.js';
export { analyzeShopping, checkProductInAnswer, extractAmounts } from './analyze.js';
export { buildShoppingQuestions } from './questions.js';
export type { ShoppingQuestionCandidate } from './questions.js';
export type {
  Product, Catalog, CatalogWarning,
  PriceVerdict, ProductSampleCheck, ProductPlatformStats,
  ShoppingPlatform, ShoppingReport,
} from './types.js';
