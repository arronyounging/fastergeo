/**
 * Sentiment classification for brand mentions in unprompted answers.
 *
 * Commercial tools ship "sentiment" as an unexplained score. Ours follows the
 * same discipline as recognition classification:
 * 1. Deterministic layer — high-precision negative patterns (zh + en),
 *    tested ONLY on sentences that mention the brand, so a warning about a
 *    competitor never counts against the brand.
 * 2. Optional LLM judge for positive / neutral / negative.
 * 3. Undecided without a judge → 'unverified' — reported as unmeasured,
 *    never guessed. A negative verdict must carry quoted evidence.
 */

import { mentions } from './matching.js';
import type { SentimentJudge, SentimentResult } from './types.js';

/** High-precision "actively negative about this entity" patterns (zh + en). */
const NEGATIVE_PATTERNS: RegExp[] = [
  /不(建议|推荐)(使用|购买|选择)?/,
  /(避免|谨慎|警惕)(使用|购买|选择)/,
  /(大量|不少|很多)?(投诉|差评|负面评价)/,
  /(骗局|跑路|欺诈|虚假宣传)/,
  /(质量|服务|体验)(很|较|非常)?差/,
  /(?<![\w-])(avoid|scam|fraud|misleading)(?![\w-])/i,
  /(?<![\w-])not recommended(?![\w-])/i,
  /(?<![\w-])(numerous|many) complaints(?![\w-])/i,
  /(?<![\w-])poor (quality|service|experience)(?![\w-])/i,
];

/** Split into sentences across CJK and Latin terminators. */
const SENTENCE_RE = /[^。！？.!?\n]+[。！？.!?]?/g;

/**
 * Classify sentiment of an answer's brand mentions. Call only for answers
 * that mention the brand; returns 'unverified' otherwise.
 */
export async function classifySentiment(
  answer: string,
  brandNames: string[],
  opts: { judge?: SentimentJudge } = {},
): Promise<SentimentResult> {
  const brandSentences = (answer.match(SENTENCE_RE) ?? [])
    .filter(s => mentions(s, brandNames));
  if (brandSentences.length === 0) {
    return { verdict: 'unverified', method: 'heuristic' };
  }
  for (const sentence of brandSentences) {
    for (const re of NEGATIVE_PATTERNS) {
      const m = re.exec(sentence);
      if (m) {
        return { verdict: 'negative', evidence: sentence.trim().slice(0, 200), method: 'heuristic' };
      }
    }
  }
  if (opts.judge) {
    return opts.judge({ answer, brandName: brandNames[0] });
  }
  return { verdict: 'unverified', method: 'heuristic' };
}

/**
 * Build a SentimentJudge backed by any LLM ask() function. Negative without
 * quoted evidence is downgraded to unverified — same rule as confusion.
 */
export function makeSentimentJudge(
  ask: (prompt: string) => Promise<string>,
): SentimentJudge {
  return async ({ answer, brandName }) => {
    const prompt = [
      `你是品牌口碑审核员。判断下面这段 AI 回答对品牌「${brandName}」的评价倾向。`,
      '',
      '回答原文：',
      answer.slice(0, 3000),
      '',
      '只输出 JSON：{"verdict":"positive|neutral|negative","evidence":"从回答中逐字引用的关键句"}',
      '判定标准：positive=明确正面推荐或称赞；neutral=客观提及无倾向；',
      'negative=负面评价/劝退（必须引用证据）；拿不准就 neutral。',
    ].join('\n');
    const raw = await ask(prompt);
    try {
      const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const parsed = JSON.parse(jsonText);
      const v = parsed.verdict;
      const evidence = typeof parsed.evidence === 'string' ? parsed.evidence.trim() : '';
      if (v === 'negative' && !evidence) {
        return { verdict: 'unverified', method: 'judge' };
      }
      if (v === 'positive' || v === 'neutral' || v === 'negative') {
        return { verdict: v, evidence: evidence || undefined, method: 'judge' };
      }
    } catch { /* fall through */ }
    return { verdict: 'unverified', method: 'judge' };
  };
}
