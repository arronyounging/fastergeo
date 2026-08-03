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
    // Prompt v2 — encodes the adjudication rulebook (bench/answers/RULEBOOK.md)
    // with precedent examples. Changes to these rules must update the rulebook
    // and re-run the golden bench.
    const prompt = [
      `你是品牌认知审核员。判断下面这段 AI 回答（可能是任何语言）是否真的认识品牌「${brandName}」。`,
      brandDescription ? `该品牌实际是：${brandDescription}` : '（未提供品牌实际描述——判 knows 需格外谨慎）',
      '',
      '回答原文：',
      answer.slice(0, 3000),
      '',
      '四个判定，规则如下：',
      '- knows：回答**断言了正确的主营身份**（行业/产品对）。细节小错（年份、城市）不影响 knows。',
      '- unknown：回答**明确承认缺乏该品牌的信息**（任何措辞的"不了解/查不到/资料不足/不是知名品牌且缺乏数据"）。',
      '- confused：回答**自信地断言了错误身份**——说成别的行业、同名的另一家公司、或编造了属于别家的具体业务。',
      '  哪怕回答里一半正确，只要自信断言了一条错误身份线，也判 confused。',
      '- unverified：以上都不成立。特别注意以下情形一律 unverified，不是 unknown：',
      '  · 泛泛的通用建议（"是否可信要看评价/售后/资质……"）——没断言身份也没承认不了解；',
      '  · 纯粹重复品牌名、没有任何实质内容；',
      '  · 从名字猜测（"听起来像是……可能是……"）——猜测不是认知，猜对了也不算；',
      '  · 拒绝评价（"我不便评价具体企业"）——拒答不等于不知道。',
      '',
      '判例：',
      '「X 是否可靠取决于评价、质量、售后……建议多方对比」→ unverified（通用模板）',
      '「从名字看 X 可能是灯具相关的公司，不确定」→ unverified（猜测）',
      '「查不到 X 的资料，无法评价」→ unknown（明确承认）',
      '「X 主要做 A（正确），同时也经营 B（错误行业）」→ confused（含错误断言）',
      '开头含糊但后文正确描述了主营 → knows',
      '',
      '只输出 JSON：{"verdict":"knows|unknown|confused|unverified","evidence":"从回答原文中逐字复制的关键句"}',
      'evidence 必须从回答原文**一字不差地复制**（不要改写、不要省略号截断）；',
      'confused 的 evidence 必须是那句错误断言。拿不准就 unverified。',
    ].join('\n');
    const raw = await ask(prompt);
    try {
      const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const parsed = JSON.parse(jsonText);
      const v = parsed.verdict;
      const evidence = typeof parsed.evidence === 'string' ? parsed.evidence.trim() : '';
      // A confusion verdict must be backed by a quote that actually exists in
      // the answer (whitespace-normalized). No quote, or an invented quote →
      // unverified. An unsupported P0 claim is worse than no claim.
      if (v === 'confused') {
        const norm = (s: string): string => s.replace(/\s+/g, '');
        if (!evidence || !norm(answer).includes(norm(evidence))) {
          return { verdict: 'unverified', method: 'judge' };
        }
      }
      if (v === 'knows' || v === 'unknown' || v === 'confused' || v === 'unverified') {
        return { verdict: v, evidence: evidence || undefined, method: 'judge' };
      }
    } catch { /* fall through */ }
    return { verdict: 'unverified', method: 'judge' };
  };
}
