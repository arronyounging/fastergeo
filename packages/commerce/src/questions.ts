/**
 * Buying-intent question CANDIDATES from a catalog. Same rule as suggest
 * mining: candidates are proposed, never auto-added — the question bank is
 * held constant across periods, and changing it is a human decision.
 */

import type { Product } from './types.js';

export interface ShoppingQuestionCandidate {
  text: string;
  market: 'cn' | 'global';
  intent: 'category-best' | 'product-worth' | 'product-price' | 'product-vs';
  /** Product or category that produced this candidate. */
  about: string;
}

const dedupe = (list: ShoppingQuestionCandidate[]): ShoppingQuestionCandidate[] => {
  const seen = new Set<string>();
  return list.filter(c => {
    const k = `${c.market}:${c.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function buildShoppingQuestions(products: Product[]): ShoppingQuestionCandidate[] {
  const out: ShoppingQuestionCandidate[] = [];
  const categories = [...new Set(products.map(p => p.category).filter((c): c is string => Boolean(c)))];

  for (const c of categories) {
    out.push(
      { text: `${c}哪家好？`, market: 'cn', intent: 'category-best', about: c },
      { text: `预算内${c}推荐`, market: 'cn', intent: 'category-best', about: c },
      { text: `best ${c} to buy`, market: 'global', intent: 'category-best', about: c },
      { text: `${c} recommendations`, market: 'global', intent: 'category-best', about: c },
    );
  }
  for (const p of products) {
    out.push(
      { text: `${p.name} 值得买吗？`, market: 'cn', intent: 'product-worth', about: p.name },
      { text: `${p.name} 多少钱？`, market: 'cn', intent: 'product-price', about: p.name },
      { text: `is ${p.name} worth it?`, market: 'global', intent: 'product-worth', about: p.name },
      { text: `${p.name} price`, market: 'global', intent: 'product-price', about: p.name },
      { text: `${p.name} vs alternatives`, market: 'global', intent: 'product-vs', about: p.name },
    );
  }
  return dedupe(out);
}
