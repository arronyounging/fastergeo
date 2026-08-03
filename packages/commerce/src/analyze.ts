/**
 * Shopping-sample analysis: product mentions and price accuracy, fully
 * deterministic. A wrong-price verdict always carries the quoted sentence.
 *
 * Price comparison is intentionally strict-but-scoped: amounts are only
 * read from sentences that mention the product (an unrelated price two
 * paragraphs away must not trigger a false wrong-price), and a sentence
 * quoting several amounts counts as correct if ANY equals the expected
 * price (AI often quotes ranges or sale prices alongside).
 */

import { matchRanges } from '@fastergeo/metrics';
import type { Sample } from '@fastergeo/metrics';
import type {
  Product, ProductPlatformStats, ProductSampleCheck, ShoppingPlatform, ShoppingReport,
} from './types.js';

/**
 * Decimal-safe sentence split: CJK terminators split anywhere; Latin .!?
 * only split when followed by whitespace/end — "$54.99" must never be cut
 * into "$54" + "99" (that would fabricate wrong-price findings).
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？])|(?<=[.!?])(?=\s|$)|\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Currency amounts in a sentence: ¥1,299 / $49.99 / 1299元 / USD 49. */
const AMOUNT_RE = /(?:[¥￥$€£]|USD|CNY|RMB|EUR|GBP)\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(?:元|美元|欧元|英镑)/g;

export function extractAmounts(sentence: string): number[] {
  const out: number[] = [];
  for (const m of sentence.matchAll(AMOUNT_RE)) {
    const raw = (m[1] ?? m[2] ?? '').replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function productNames(p: Product): string[] {
  return [p.name, ...(p.aliases ?? [])];
}

/**
 * Check one product against one answer.
 *
 * Known limitation, stated: amounts are compared numerically, never
 * currency-converted. An answer quoting a correctly-converted price in a
 * different currency will be flagged wrong-price — treat the finding as a
 * review lead with evidence attached, not a verdict of dishonesty.
 */
export function checkProductInAnswer(answer: string, product: Product): ProductSampleCheck {
  const sentences = splitSentences(answer)
    .filter(s => matchRanges(s, productNames(product)).length > 0);
  if (sentences.length === 0) return { productId: product.id, verdict: 'not-mentioned' };

  const amounts = sentences.flatMap(extractAmounts);
  if (amounts.length === 0) {
    return { productId: product.id, verdict: 'no-price-quoted', evidence: sentences[0].trim().slice(0, 200) };
  }
  if (product.price === null) {
    // We don't know our own price — we cannot call anyone else's wrong.
    return { productId: product.id, verdict: 'no-price-quoted', foundAmounts: amounts, evidence: sentences[0].trim().slice(0, 200) };
  }
  const correct = amounts.some(a => Math.abs(a - (product.price as number)) < 0.005);
  if (correct) return { productId: product.id, verdict: 'correct-price' };
  const evidenceSentence = sentences.find(s => extractAmounts(s).length > 0) ?? sentences[0];
  return {
    productId: product.id,
    verdict: 'wrong-price',
    foundAmounts: amounts,
    evidence: evidenceSentence.trim().slice(0, 200),
  };
}

/** Full shopping report: samples × catalog, grouped by provider. */
export function analyzeShopping(samples: Sample[], products: Product[], brand: string): ShoppingReport {
  const byProvider = new Map<string, Sample[]>();
  for (const s of samples.filter(s => !s.brandInQuestion)) {
    const list = byProvider.get(s.providerId) ?? [];
    list.push(s);
    byProvider.set(s.providerId, list);
  }

  const platforms: ShoppingPlatform[] = [...byProvider.entries()].map(([providerId, group]) => {
    const stats = new Map<string, ProductPlatformStats>();
    for (const p of products) {
      stats.set(p.id, {
        productId: p.id, name: p.name, mentions: 0,
        priceChecks: { correct: 0, wrong: 0, none: 0 }, wrongPriceEvidence: [],
      });
    }
    let anyMention = 0;
    for (const s of group) {
      let mentionedInSample = false;
      for (const p of products) {
        const check = checkProductInAnswer(s.answer, p);
        if (check.verdict === 'not-mentioned') continue;
        mentionedInSample = true;
        const st = stats.get(p.id)!;
        st.mentions++;
        if (check.verdict === 'correct-price') st.priceChecks.correct++;
        else if (check.verdict === 'wrong-price') {
          st.priceChecks.wrong++;
          if (check.evidence) st.wrongPriceEvidence.push(check.evidence);
        } else st.priceChecks.none++;
      }
      if (mentionedInSample) anyMention++;
    }
    return {
      providerId,
      market: group[0].market,
      samples: group.length,
      anyProductMentionRate: group.length > 0 ? anyMention / group.length : null,
      products: [...stats.values()].sort((a, b) => b.mentions - a.mentions),
    };
  }).sort((a, b) => a.market.localeCompare(b.market) || a.providerId.localeCompare(b.providerId));

  return {
    generatedAt: new Date().toISOString(),
    brand,
    totalSamples: samples.length,
    platforms,
  };
}
