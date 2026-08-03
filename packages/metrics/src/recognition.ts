/**
 * Recognition-quality classification for probe answers.
 *
 * Field finding that motivated this module: four engines all scored "100%
 * probe recognition" under name-echo counting, while in reality one truly
 * knew the brand, two admitted ignorance, and one attributed the brand to a
 * completely different industry. Name echo is not knowledge.
 *
 * Two layers:
 * 1. Deterministic heuristics — high-precision denial patterns classify
 *    'unknown' without an LLM.
 * 2. Optional LLM judge — decides 'knows' vs 'confused' (industry
 *    misattribution needs semantic judgment). Without a judge, those stay
 *    'unverified' — reported as unmeasured, never guessed.
 */

import type { RecognitionJudge, RecognitionResult } from './types.js';

/** High-precision "I don't know this brand" patterns (zh + en). */
const DENIAL_PATTERNS: RegExp[] = [
  /无法(提供|给出|确认)[^。]{0,20}(信息|资料|数据|评价)/,
  /没有(相关|足够|具体)?(的)?(信息|资料|数据|了解)/,
  /(不了解|不清楚|不知道|未收录|查不到)[^。]{0,15}(品牌|公司|产品|信息)?/,
  /并?不是一个?(全球)?(知名|主流|大)(的)?品牌/,
  /(i|we) (do not|don't|cannot|can't) (have|find|provide) (any |specific |enough )?(information|details|data)/i,
  /not familiar with/i,
  /no (public |verifiable )?(information|records?) (about|on|available)/i,
  /couldn'?t find (any )?(information|details)/i,
];

/**
 * Classify one probe answer. Deterministic layer only; pass a judge to
 * resolve 'knows' vs 'confused'.
 */
export async function classifyRecognition(
  answer: string,
  brandName: string,
  opts: { brandDescription?: string; judge?: RecognitionJudge } = {},
): Promise<RecognitionResult> {
  for (const re of DENIAL_PATTERNS) {
    const m = re.exec(answer);
    if (m) {
      return { verdict: 'unknown', evidence: m[0], method: 'heuristic' };
    }
  }
  if (opts.judge) {
    return opts.judge({
      answer,
      brandName,
      brandDescription: opts.brandDescription,
    });
  }
  return { verdict: 'unverified', method: 'heuristic' };
}

/**
 * Build a RecognitionJudge backed by any LLM ask() function. The judge is
 * instructed to quote evidence and to default to 'unverified' when unsure —
 * a confusion verdict must be supportable by a quoted passage.
 */
export function makeLlmJudge(
  ask: (prompt: string) => Promise<string>,
): RecognitionJudge {
  return async ({ answer, brandName, brandDescription }) => {
    const prompt = [
      `你是品牌认知审核员。判断下面这段 AI 回答是否真的认识品牌「${brandName}」。`,
      brandDescription ? `该品牌实际是：${brandDescription}` : '',
      '',
      '回答原文：',
      answer.slice(0, 3000),
      '',
      '只输出 JSON：{"verdict":"knows|unknown|confused|unverified","evidence":"从回答中逐字引用的关键句"}',
      '判定标准：knows=正确描述了品牌；unknown=表示不了解；',
      'confused=把品牌说成别的行业/别的实体（必须引用证据）；拿不准就 unverified。',
    ].join('\n');
    const raw = await ask(prompt);
    try {
      const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const parsed = JSON.parse(jsonText);
      const v = parsed.verdict;
      const evidence = typeof parsed.evidence === 'string' ? parsed.evidence.trim() : '';
      // A confusion verdict without quoted evidence is not a verdict —
      // downgrade to unverified rather than accept an unsupported P0 claim.
      if (v === 'confused' && !evidence) {
        return { verdict: 'unverified', method: 'judge' };
      }
      if (v === 'knows' || v === 'unknown' || v === 'confused' || v === 'unverified') {
        return { verdict: v, evidence: evidence || undefined, method: 'judge' };
      }
    } catch { /* fall through */ }
    return { verdict: 'unverified', method: 'judge' };
  };
}
