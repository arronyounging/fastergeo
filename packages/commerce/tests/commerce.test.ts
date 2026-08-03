import { describe, it, expect } from 'vitest';
import { extractJsonLdProducts, parseShopifyProducts } from '../src/ingest.js';
import { checkProductInAnswer, extractAmounts, analyzeShopping } from '../src/analyze.js';
import { buildShoppingQuestions } from '../src/questions.js';
import type { Product } from '../src/types.js';
import type { Sample } from '@fastergeo/metrics';

const HOODIE: Product = {
  id: 'sku-1', name: 'Cloud Hoodie', aliases: ['云朵卫衣'],
  url: 'https://a.com/p/hoodie', price: 54.99, currency: 'USD', category: 'custom hoodie',
};

describe('extractJsonLdProducts', () => {
  it('extracts Product nodes with offers, including @graph nesting', () => {
    const html = `<html><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"Product","name":"Cloud Hoodie","sku":"sku-1","url":"/p/hoodie",
         "offers":{"@type":"Offer","price":"54.99","priceCurrency":"USD"}}]}
      </script></html>`;
    const r = extractJsonLdProducts(html, 'https://a.com/p/hoodie');
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ id: 'sku-1', name: 'Cloud Hoodie', price: 54.99, currency: 'USD' });
    expect(r.products[0].url).toBe('https://a.com/p/hoodie');
  });

  it('warns on pages without Product JSON-LD — that absence is a finding', () => {
    const r = extractJsonLdProducts('<html><body>plain</body></html>', 'https://a.com/x');
    expect(r.products).toHaveLength(0);
    expect(r.warnings[0].message).toContain('no Product JSON-LD');
  });

  it('missing offers.price stays null with a warning, never 0', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"X"}</script>`;
    const r = extractJsonLdProducts(html, 'https://a.com/x');
    expect(r.products[0].price).toBeNull();
    expect(r.warnings.some(w => w.message.includes('offers.price'))).toBe(true);
  });
});

describe('parseShopifyProducts', () => {
  it('parses products.json and states the currency honesty caveat', () => {
    const body = JSON.stringify({ products: [
      { title: 'Cloud Hoodie', handle: 'cloud-hoodie', product_type: 'Hoodies', variants: [{ price: '54.99', sku: 'sku-1' }] },
    ]});
    const r = parseShopifyProducts(body, 'https://shop.a.com');
    expect(r.products[0]).toMatchObject({ id: 'sku-1', price: 54.99, currency: null });
    expect(r.products[0].url).toBe('https://shop.a.com/products/cloud-hoodie');
    expect(r.warnings.some(w => w.message.includes('currency'))).toBe(true);
  });

  it('rejects non-Shopify payloads by name', () => {
    expect(parseShopifyProducts('{"items":[]}', 'https://x.com').warnings[0].message).toContain('products');
  });
});

describe('extractAmounts', () => {
  it('reads ¥ / $ / 元 / USD forms', () => {
    expect(extractAmounts('售价 ¥1,299，约合 $179.99 或 1299元，即 USD 180')).toEqual([1299, 179.99, 1299, 180]);
  });
});

describe('checkProductInAnswer — the wrong-price detector', () => {
  it('correct when any amount in the mention sentence matches', () => {
    const r = checkProductInAnswer('Cloud Hoodie costs $54.99 (down from $69).', HOODIE);
    expect(r.verdict).toBe('correct-price');
  });

  it('wrong-price carries the quoted sentence and found amounts', () => {
    const r = checkProductInAnswer('推荐云朵卫衣，售价 ¥399。另一款是 $20。', HOODIE);
    expect(r.verdict).toBe('wrong-price');
    expect(r.foundAmounts).toEqual([399]);
    expect(r.evidence).toContain('¥399');
  });

  it('amounts outside the mention sentence never trigger wrong-price', () => {
    const r = checkProductInAnswer('Cloud Hoodie is popular. Another product costs $999.', HOODIE);
    expect(r.verdict).toBe('no-price-quoted');
  });

  it('uses word boundaries — CloudHoodiePro is not our product', () => {
    expect(checkProductInAnswer('CloudHoodiePro costs $10.', { ...HOODIE, aliases: [] }).verdict).toBe('not-mentioned');
  });

  it('unknown own price cannot call anyone wrong', () => {
    const r = checkProductInAnswer('Cloud Hoodie costs $99.', { ...HOODIE, price: null });
    expect(r.verdict).toBe('no-price-quoted');
    expect(r.foundAmounts).toEqual([99]);
  });
});

describe('analyzeShopping', () => {
  const mk = (providerId: string, answer: string, brandInQuestion = false): Sample => ({
    providerId, market: providerId === 'doubao' ? 'cn' : 'global', questionId: 'q1',
    question: 'best hoodie?', brandInQuestion, answer, citations: [],
  });

  it('aggregates per provider with probe segregation and evidence', () => {
    const r = analyzeShopping([
      mk('openai', 'Cloud Hoodie costs $54.99.'),
      mk('openai', 'Try Printful hoodies.'),
      mk('doubao', '推荐云朵卫衣，售价 ¥399。'),
      mk('doubao', 'Cloud Hoodie 咋样？', true), // probe — excluded
    ], [HOODIE], 'Custyle');
    const openai = r.platforms.find(p => p.providerId === 'openai')!;
    expect(openai.samples).toBe(2);
    expect(openai.anyProductMentionRate).toBe(0.5);
    expect(openai.products[0].priceChecks.correct).toBe(1);
    const doubao = r.platforms.find(p => p.providerId === 'doubao')!;
    expect(doubao.samples).toBe(1); // probe excluded
    expect(doubao.products[0].priceChecks.wrong).toBe(1);
    expect(doubao.products[0].wrongPriceEvidence[0]).toContain('¥399');
  });
});

describe('buildShoppingQuestions', () => {
  it('produces cn+global buying-intent candidates from products and categories', () => {
    const qs = buildShoppingQuestions([HOODIE]);
    expect(qs.some(q => q.text === 'custom hoodie哪家好？')).toBe(true);
    expect(qs.some(q => q.text === 'is Cloud Hoodie worth it?')).toBe(true);
    expect(qs.filter(q => q.market === 'cn').length).toBeGreaterThan(0);
    expect(new Set(qs.map(q => `${q.market}:${q.text}`)).size).toBe(qs.length); // deduped
  });
});
