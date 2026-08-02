/**
 * Bootstrap: URL → project foundation (brand config, fact store, question bank).
 *
 * Discipline (learned from field friction):
 * - Facts come ONLY from site text the LLM was shown; each carries its source
 *   URL. What can't be extracted becomes an unconfirmed placeholder — never
 *   filled from world knowledge.
 * - Competitor candidates carry confidence + reasoning and are ALWAYS marked
 *   for human review (real competitive sets come from sampling answers, not
 *   guessing). Deterministic validation rejects generic terms and channels.
 * - Questions: native phrasing per market (not translations), 7 groups;
 *   brand-naming probes are flagged so metrics can segregate them.
 */

import type { FactStore } from './types.js';

export interface CompetitorCandidate {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  why: string;
  /** Always true — sampling-confirmed sets replace guesses later. */
  needsReview: true;
}

export interface QuestionSeed {
  id: string;
  group: '推荐' | '比较' | '替代' | '价格' | '风险' | '品牌验证' | '场景';
  market: 'cn' | 'global';
  text: string;
  /** True when the question names the brand (probe — metrics segregate). */
  brandInQuestion: boolean;
}

export interface BootstrapResult {
  brand: {
    name: string;
    aliases: string[];
    domains: string[];
    description: string;
    industry: string;
    competitors: Array<{ name: string; aliases: string[] }>;
  };
  competitorCandidates: CompetitorCandidate[];
  facts: FactStore;
  questions: QuestionSeed[];
  /** Fields the site did not provide — human must resolve or mark 不对外. */
  unresolved: string[];
}

/** Generic terms/channels that are never valid competitor names. */
const COMPETITOR_REJECT = [
  /定制|平台|服务|商品|工具|软件|系统|方案|小程序/,
  /^(ChatGPT|Claude|Gemini|DeepSeek|豆包|Kimi|Perplexity|Google|百度|淘宝|天猫|京东|拼多多|抖音|Amazon|Shopify|Etsy)$/i,
  /^.{1}$|^.{40,}$/,
];

export function validateCompetitor(name: string): boolean {
  return !COMPETITOR_REJECT.some(re => re.test(name.trim()));
}

export interface PageText {
  url: string;
  title: string;
  text: string;
}

export function bootstrapPrompt(root: string, pages: PageText[]): string {
  const corpus = pages
    .map(p => `【${p.url}】${p.title}\n${p.text.slice(0, 4000)}`)
    .join('\n\n');
  return [
    '你是 GEO 项目引导专家。仅根据下面提供的官网正文（不得使用你的世界知识补充品牌信息），推导品牌底座。',
    `官网：${root}`,
    '',
    '【官网正文】',
    corpus.slice(0, 16_000),
    '',
    '只输出一个 JSON 对象，结构如下（不要输出其他内容）：',
    `{
  "name": "品牌规范名",
  "aliases": ["别名与常见错写"],
  "description": "一句话定义（只基于正文，40字内）",
  "industry": "行业",
  "facts": [{"claim": "从正文提取的事实（含数字/价格/品类等）", "source": "出处URL"}],
  "unresolved": ["正文找不到的关键信息：如 成立时间/工商主体/可具名客户"],
  "competitors": [{"name": "真实竞品公司名", "confidence": "high|medium|low", "why": "为什么是竞品"}],
  "questions": {
    "cn": [{"group": "推荐|比较|替代|价格|风险|场景", "text": "中文口语问法，像真实用户，不点名品牌"}],
    "global": [{"group": "推荐|比较|替代|价格|风险|场景", "text": "native English phrasing, no brand name"}]
  }
}`,
    '',
    '硬性规则：',
    '1. facts 里每一条必须能在上面的正文里找到依据；找不到的放 unresolved，禁止编造。',
    '2. competitors 必须是具体公司/产品名，禁止品类词（如"定制平台"）、禁止渠道（如电商平台）、禁止 AI 引擎。没把握就少写。',
    '3. questions 每组每市场 2-3 题，cn 用中文母语者的真实问法，global 用英文母语者问法（不是翻译）。',
  ].join('\n');
}

function parseJson(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('bootstrap: LLM 未返回 JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

const GROUPS = new Set(['推荐', '比较', '替代', '价格', '风险', '场景']);

/**
 * Assemble the bootstrap result from LLM output + deterministic validation.
 * `askLlm` is injected so the package stays transport-agnostic and testable.
 */
export async function bootstrapProject(
  root: string,
  pages: PageText[],
  askLlm: (prompt: string) => Promise<string>,
): Promise<BootstrapResult> {
  const raw = await askLlm(bootstrapPrompt(root, pages));
  const d = parseJson(raw);
  const host = new URL(root).hostname.replace(/^www\./, '');

  const candidates: CompetitorCandidate[] = (Array.isArray(d.competitors) ? d.competitors : [])
    .filter((c: any) => c?.name && validateCompetitor(String(c.name)))
    .map((c: any) => ({
      name: String(c.name).trim(),
      confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : 'low',
      why: String(c.why ?? ''),
      needsReview: true as const,
    }));

  const questions: QuestionSeed[] = [];
  let qi = 0;
  for (const market of ['cn', 'global'] as const) {
    for (const q of d.questions?.[market] ?? []) {
      if (!q?.text || !GROUPS.has(q.group)) continue;
      qi += 1;
      questions.push({
        id: `q${String(qi).padStart(3, '0')}`,
        group: q.group,
        market,
        text: String(q.text).trim(),
        brandInQuestion: false,
      });
    }
  }
  // Brand-probe questions are template-generated (deterministic), zh + en.
  const name = String(d.name ?? host).trim();
  for (const [text, market] of [
    [`${name} 是一家什么样的公司？值得信赖吗？`, 'cn'],
    [`${name} 的用户评价通常是什么样的？`, 'cn'],
    [`What is ${name} and is it trustworthy?`, 'global'],
  ] as const) {
    qi += 1;
    questions.push({ id: `q${String(qi).padStart(3, '0')}`, group: '品牌验证', market, text, brandInQuestion: true });
  }

  const facts: FactStore = {
    brand: name,
    definition: String(d.description ?? '').trim(),
    facts: (Array.isArray(d.facts) ? d.facts : []).map((f: any, i: number) => ({
      id: `F-${String(i + 1).padStart(3, '0')}`,
      claim: String(f.claim ?? '').trim(),
      grade: 'A' as const, // 只允许从正文提取 → 一手来源
      source: String(f.source ?? root),
      status: 'confirmed' as const,
    })).filter((f: any) => f.claim),
    doNotClaim: [],
  };
  // Unresolved items become unconfirmed placeholders so they stay visible.
  const unresolved: string[] = (Array.isArray(d.unresolved) ? d.unresolved : []).map(String);
  for (const [i, u] of unresolved.entries()) {
    facts.facts.push({
      id: `F-U${String(i + 1).padStart(2, '0')}`,
      claim: u,
      grade: 'E',
      status: 'unconfirmed',
    });
  }

  return {
    brand: {
      name,
      aliases: [...new Set([...(d.aliases ?? []).map(String), host.toUpperCase()])],
      domains: [host],
      description: facts.definition,
      industry: String(d.industry ?? '').trim(),
      // 采样确认前，只把 high 置信候选放进追踪清单（其余留在 candidates 供人审）
      competitors: candidates.filter(c => c.confidence === 'high').map(c => ({ name: c.name, aliases: [] })),
    },
    competitorCandidates: candidates,
    facts,
    questions,
    unresolved,
  };
}
