/**
 * Catalog ingestion: JSON-LD Product schema from pages, or Shopify's
 * public /products.json. Extraction never invents: a missing price stays
 * null (and is warned about), it does not become 0.
 */

import type { Catalog, CatalogWarning, Product } from './types.js';

/** All JSON-LD blocks in a page, tolerantly parsed. */
function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch { /* malformed block — the page's problem, surfaced via warning below */ }
  }
  return blocks;
}

interface JsonLdProduct {
  name?: unknown;
  offers?: unknown;
  url?: unknown;
  category?: unknown;
  sku?: unknown;
  '@id'?: unknown;
}

function isProductNode(node: unknown): node is JsonLdProduct {
  const t = (node as { '@type'?: unknown })?.['@type'];
  return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
}

/** Walk @graph / arrays / plain objects for Product nodes. */
function findProductNodes(block: unknown): JsonLdProduct[] {
  if (Array.isArray(block)) return block.flatMap(findProductNodes);
  if (block && typeof block === 'object') {
    const out: JsonLdProduct[] = [];
    if (isProductNode(block)) out.push(block);
    const graph = (block as { '@graph'?: unknown })['@graph'];
    if (Array.isArray(graph)) out.push(...graph.flatMap(findProductNodes));
    return out;
  }
  return [];
}

function firstOffer(offers: unknown): { price: number | null; currency: string | null } {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    const raw = (o as { price?: unknown; lowPrice?: unknown })?.price
      ?? (o as { lowPrice?: unknown })?.lowPrice;
    const price = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/[,\s]/g, '')) : NaN;
    const cur = (o as { priceCurrency?: unknown })?.priceCurrency;
    if (Number.isFinite(price)) {
      return { price, currency: typeof cur === 'string' ? cur : null };
    }
  }
  return { price: null, currency: null };
}

/** Extract Products from one page's HTML. */
export function extractJsonLdProducts(html: string, pageUrl: string): { products: Product[]; warnings: CatalogWarning[] } {
  const products: Product[] = [];
  const warnings: CatalogWarning[] = [];
  const nodes = jsonLdBlocks(html).flatMap(findProductNodes);
  if (nodes.length === 0) {
    warnings.push({ url: pageUrl, message: 'no Product JSON-LD on page — AI shopping surfaces read structured data first; add schema.org/Product with offers' });
    return { products, warnings };
  }
  for (const [i, n] of nodes.entries()) {
    const name = typeof n.name === 'string' ? n.name.trim() : '';
    if (!name) { warnings.push({ url: pageUrl, message: 'Product JSON-LD without a name — skipped' }); continue; }
    const { price, currency } = firstOffer(n.offers);
    if (price === null) {
      warnings.push({ url: pageUrl, message: `"${name}": Product JSON-LD has no parseable offers.price — price checks will be impossible for it` });
    }
    products.push({
      id: typeof n.sku === 'string' && n.sku ? n.sku : `${new URL(pageUrl).pathname}#${i}`,
      name,
      url: typeof n.url === 'string' && n.url ? new URL(n.url, pageUrl).href : pageUrl,
      price,
      currency,
      ...(typeof n.category === 'string' ? { category: n.category } : {}),
    });
  }
  return { products, warnings };
}

/** Parse Shopify's public /products.json body. */
export function parseShopifyProducts(body: string, baseUrl: string): { products: Product[]; warnings: CatalogWarning[] } {
  const warnings: CatalogWarning[] = [];
  let j: { products?: Array<{ title?: string; handle?: string; product_type?: string; variants?: Array<{ price?: string | number; sku?: string }> }> };
  try {
    j = JSON.parse(body);
  } catch {
    return { products: [], warnings: [{ message: 'not valid JSON — is this really a Shopify /products.json response?' }] };
  }
  if (!Array.isArray(j.products)) {
    return { products: [], warnings: [{ message: 'no "products" array — is this really a Shopify /products.json response?' }] };
  }
  // Shopify's public endpoint omits shop currency — recorded as null, never guessed.
  warnings.push({ message: 'Shopify products.json does not state a currency — currency recorded as null; price checks compare numbers only' });
  const products: Product[] = [];
  for (const p of j.products) {
    if (!p.title || !p.handle) continue;
    const raw = p.variants?.[0]?.price;
    const price = raw === undefined ? null : Number(String(raw).replace(/[,\s]/g, ''));
    if (price === null || !Number.isFinite(price)) {
      warnings.push({ message: `"${p.title}": no parseable variant price — recorded as null` });
    }
    products.push({
      id: p.variants?.[0]?.sku || p.handle,
      name: p.title,
      url: `${baseUrl.replace(/\/$/, '')}/products/${p.handle}`,
      price: Number.isFinite(price as number) ? (price as number) : null,
      currency: null,
      ...(p.product_type ? { category: p.product_type } : {}),
    });
  }
  return { products, warnings };
}
