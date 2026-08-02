/**
 * Fabrication-risk lint — the deterministic Fidelity Gate.
 *
 * LLMs pad drafts with plausible numbers, superlatives, and claims. Every
 * number and superlative in a draft must trace to a confirmed fact in the
 * store (or be a structural number like list indices); everything else is
 * flagged for human resolution. A draft with fabrication issues is not
 * publishable — this gate runs before any human review, not instead of it.
 */

import type { FabricationIssue, FactStore } from './types.js';

/** Numbers that never need sourcing: list markers, small counts, years. */
const STRUCTURAL_NUMBER = /^([0-9]|1[0-9]|20|20[0-9]{2})$/;

const SUPERLATIVES =
  /(最好|最强|第一|领先|顶级|唯一|No\.?\s?1|(?<![\w-])best(?![\w-])|(?<![\w-])leading(?![\w-])|(?<![\w-])top-rated(?![\w-])|#1)/gi;

/** All digit-bearing tokens with light context (percentages, prices, counts). */
const NUMBER_TOKEN = /\d[\d,.]*\s*(?:%|％|万|亿|元|美元|倍|years?|users?|customers?|\+)?/g;

function confirmedCorpus(store: FactStore): string {
  return [
    store.definition,
    ...store.facts.filter(f => f.status === 'confirmed' && f.grade !== 'E').map(f => f.claim),
  ].join('\n');
}

/** Normalize a number token for containment check (strip separators/space). */
function norm(token: string): string {
  return token.replace(/[,\s]/g, '');
}

export function lintFabrication(draft: string, store: FactStore): FabricationIssue[] {
  const issues: FabricationIssue[] = [];
  const corpus = norm(confirmedCorpus(store));
  const lines = draft.split('\n');

  lines.forEach((line, i) => {
    // Skip code fences and links' URLs
    if (/^\s*```/.test(line)) return;
    const visible = line
      .replace(/\(https?:\/\/[^)]+\)/g, '')
      // Ordinal enumerators are structure, not data: "1. " at line start or
      // inline ("…。 2. …"), and CJK enumerators "1、" "（3）"
      .replace(/(^|\s|（)\d{1,2}[.、）]\s?/g, '$1');

    for (const m of visible.matchAll(NUMBER_TOKEN)) {
      const token = m[0].trim();
      const bare = token.replace(/[^\d]/g, '');
      if (STRUCTURAL_NUMBER.test(bare)) continue;
      if (corpus.includes(norm(token)) || corpus.includes(bare)) continue;
      issues.push({
        kind: 'unsourced-number',
        quote: token,
        line: i + 1,
        suggestion: `数字「${token}」不在已确认事实库中 — 提供来源并入库，或删除。禁止编造数据。`,
      });
    }

    for (const m of visible.matchAll(SUPERLATIVES)) {
      const context = visible.slice(Math.max(0, m.index! - 20), m.index! + m[0].length + 20);
      if (corpus.includes(m[0])) continue; // 事实库明确背书的最高级表述放行
      issues.push({
        kind: 'unsourced-superlative',
        quote: context.trim(),
        line: i + 1,
        suggestion: `最高级表述「${m[0]}」无事实背书 — 改为可验证的具体优势，或提供三方来源。`,
      });
    }

    for (const banned of store.doNotClaim ?? []) {
      if (banned && visible.includes(banned)) {
        issues.push({
          kind: 'do-not-claim',
          quote: banned,
          line: i + 1,
          suggestion: `「${banned}」在品牌明确不对外声称清单中 — 必须删除。`,
        });
      }
    }
  });

  // Unconfirmed facts referenced verbatim in the draft
  for (const f of store.facts.filter(x => x.status === 'unconfirmed')) {
    const idx = draft.indexOf(f.claim);
    if (idx >= 0) {
      issues.push({
        kind: 'unconfirmed-fact',
        quote: f.claim.slice(0, 60),
        line: draft.slice(0, idx).split('\n').length,
        suggestion: `事实 ${f.id} 状态为待确认 — 确认后才能使用。`,
      });
    }
  }

  return issues;
}
