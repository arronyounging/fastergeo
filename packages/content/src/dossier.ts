/**
 * Dossier: bootstrap output → five documents a human can read and correct.
 *
 * Why this exists: bootstrap already produced everything below, as JSON. Nobody
 * opens JSON, so the work was invisible and — worse — uncorrectable. The same
 * data rendered as five documents turns "the tool wrote some config" into "I
 * have a brand dossier I can fix."
 *
 * Discipline carried through into the rendering, because a document hides its
 * provenance far more easily than a JSON file does:
 * - Every derived claim shows its source URL and evidence grade.
 * - Anything the site did not say is rendered as "unconfirmed", never omitted
 *   quietly and never filled in.
 * - Documents state which file is the source of truth, so nobody edits a view
 *   and wonders why nothing changed.
 * - voice.md is a scaffold with quoted evidence, NOT a generated voice guide.
 *   Inventing someone's brand voice from four pages is exactly the black-box
 *   behavior this project exists to argue against.
 */

import type { BootstrapResult, PageText } from './bootstrap.js';
import type { Fact, EvidenceGrade } from './types.js';

export type DossierLang = 'en' | 'zh';

export interface DossierInput {
  result: BootstrapResult;
  root: string;
  /** Site pages bootstrap read — used only to quote voice evidence. */
  pages?: PageText[];
  generatedAt?: string;
  lang?: DossierLang;
}

/** filename → markdown */
export type Dossier = Record<string, string>;

interface Msg {
  src: (f: string) => string;
  srcEditable: (f: string) => string;
  srcYours: string;
  from: (root: string, at: string) => string;
  editNote: string;
  unconfirmedNote: string;
  productTitle: string; factsTitle: string;
  competitorsTitle: string; questionsTitle: string; voiceTitle: string;
  name: string; aliases: string; domains: string; industry: string; definition: string;
  aliasWarn: string;
  unconfirmed: string; none: string;
  hClaim: string; hGrade: string; hSource: string; hStatus: string; hId: string;
  gradeKey: string; factsRule: string; doNotClaim: string;
  hCompetitor: string; hConfidence: string; hWhy: string; hReview: string;
  compNote: string; tracked: string;
  hQuestion: string; hGroup: string; hMarket: string; hProbe: string;
  qNote: string; qSeriesWarn: string;
  marketCn: string; marketGlobal: string;
  voiceIntro: string; voiceEvidence: string; voiceFill: string;
  voiceSlots: string[]; todo: string;
}

const M: Record<DossierLang, Msg> = {
  en: {
    src: (f: string) => `Source of truth: \`${f}\`. This document is generated from it.`,
    srcEditable: (f: string) => `Source of truth: **this file**. Edit it and re-run; \`${f}\` is regenerated from it. Re-running bootstrap will not overwrite your edits.`,
    srcYours: 'This file is yours. Nothing generates it and re-running bootstrap will not overwrite it.',
    from: (root: string, at: string) => `Derived from ${root} on ${at}.`,
    editNote: 'Correct anything that is wrong. Nothing here is a measurement — it is what your site said, read back to you.',
    unconfirmedNote: 'These were not on the site. They stay empty until a human fills them in. They are never guessed.',
    productTitle: 'Product Dossier', factsTitle: 'Brand Facts',
    competitorsTitle: 'Competitors', questionsTitle: 'Question Bank', voiceTitle: 'Voice Guide',
    name: 'Name', aliases: 'Aliases', domains: 'Domains', industry: 'Industry', definition: 'One-line definition',
    aliasWarn: 'A missing alias silently under-counts your visibility — every mention it misses is scored as an absence.',
    unconfirmed: 'Not found on the site', none: '(none)',
    hClaim: 'Claim', hGrade: 'Grade', hSource: 'Source', hStatus: 'Status', hId: 'ID',
    gradeKey: 'Grades: A = stated on your own site with a URL · B–D = weaker provenance · E = unusable in generated content.',
    factsRule: 'Only confirmed, non-E facts are allowed into generated content. Everything else is refused by the fabrication gate rather than softened.',
    doNotClaim: 'Never claim',
    hCompetitor: 'Competitor', hConfidence: 'Confidence', hWhy: 'Why it was suggested', hReview: 'Reviewed?',
    compNote: 'All of these are guesses from your site text. **A real competitive set comes from sampling AI answers, not from reading your homepage.** Delete the wrong ones; the survivors get tracked.',
    tracked: 'Currently tracked',
    hQuestion: 'Question', hGroup: 'Group', hMarket: 'Market', hProbe: 'Probe',
    qNote: 'Probe questions name your brand. They measure whether AI *knows* you and are kept strictly out of visibility metrics — a brand mention in an answer to "what is X" is an echo, not visibility.',
    qSeriesWarn: 'Changing this bank starts a new measurement series. Periods before and after are not comparable, so this is a human decision, never an automatic one.',
    voiceIntro: 'This file is a scaffold, not a generated voice guide. We do not invent how your brand sounds from four pages of copy.',
    voiceEvidence: 'Sentences from your site, verbatim',
    voiceFill: 'Fill these in',
    marketCn: 'China', marketGlobal: 'Global',
    voiceSlots: ['Tone in three words', 'Words we use', 'Words we never use', 'How we open', 'How we handle bad news', 'Example sentence in our voice'],
    todo: 'to fill in',
  },
  zh: {
    src: (f: string) => `事实源：\`${f}\`。本文档由它生成。`,
    srcEditable: (f: string) => `事实源：**本文件**。改完重跑，\`${f}\` 会由它重新生成。重跑 bootstrap 不会覆盖你的修改。`,
    srcYours: '这份文件归你。没有任何东西会生成它，重跑 bootstrap 也不会覆盖它。',
    from: (root: string, at: string) => `${at} 从 ${root} 推导。`,
    editNote: '错的地方直接改。这里没有任何一项是测量结果——是你网站说的话，读回给你听。',
    unconfirmedNote: '这些网站上没有。在人填之前一直空着，绝不猜。',
    productTitle: '产品档案', factsTitle: '品牌事实库',
    competitorsTitle: '竞品', questionsTitle: '问题库', voiceTitle: '语气指南',
    name: '名称', aliases: '别名', domains: '域名', industry: '行业', definition: '一句话定义',
    aliasWarn: '漏一个别名，你的可见度就被静默低估——每一条它没认出的提及都会被记成「没提到」。',
    unconfirmed: '网站上没找到', none: '（无）',
    hClaim: '事实', hGrade: '证据等级', hSource: '来源', hStatus: '状态', hId: '编号',
    gradeKey: '等级：A = 你自己网站上写着且有 URL · B–D = 出处更弱 · E = 不可用于生成内容。',
    factsRule: '只有 confirmed 且非 E 级的事实允许进入生成内容。其余的会被编造门禁**拒绝**，而不是被弱化措辞放过。',
    doNotClaim: '绝不声称',
    hCompetitor: '竞品', hConfidence: '置信度', hWhy: '为什么被列出来', hReview: '已核？',
    compNote: '这些全部是从你的网站文字里猜的。**真正的竞争集来自采样 AI 的回答，不是来自读你的首页。** 错的删掉，留下的进入跟踪。',
    tracked: '当前跟踪中',
    hQuestion: '问题', hGroup: '分组', hMarket: '市场', hProbe: '探测题',
    qNote: '探测题会点名你的品牌。它测的是 AI **认不认识**你，并且被严格排除在可见度指标之外——在「X 是什么」的回答里出现品牌名，那是回声，不是可见度。',
    qSeriesWarn: '改动题库会开启一个新的测量序列。改动前后的期不可比，所以这是人的决定，永远不自动执行。',
    voiceIntro: '这份是脚手架，不是生成好的语气指南。我们不会拿四页文案编出你的品牌怎么说话。',
    voiceEvidence: '你网站上的原句',
    voiceFill: '这些需要你填',
    marketCn: '国内', marketGlobal: '海外',
    voiceSlots: ['三个词形容语气', '我们用的词', '我们绝不用的词', '开场怎么写', '坏消息怎么说', '一句符合我们语气的示范句'],
    todo: '待填',
  },
};

const esc = (s: string): string => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

function header(title: string, m: Msg, root: string, at: string, source: string, note = m.editNote): string {
  return `# ${title}\n\n> ${m.from(root, at)}\n> ${source}\n> ${note}`;
}

function productDoc(i: DossierInput, m: Msg, at: string): string {
  const b = i.result.brand;
  const lines = [
    header(m.productTitle, m, i.root, at, m.src('brand.json')),
    '',
    `| | |`,
    `|---|---|`,
    `| **${m.name}** | ${esc(b.name)} |`,
    `| **${m.definition}** | ${esc(i.result.facts.definition) || `_${m.unconfirmed}_`} |`,
    `| **${m.industry}** | ${esc(b.industry) || `_${m.unconfirmed}_`} |`,
    `| **${m.domains}** | ${b.domains.map(esc).join(' · ') || `_${m.none}_`} |`,
    `| **${m.aliases}** | ${b.aliases.map(esc).join(' · ') || `_${m.none}_`} |`,
    '',
    `> ⚠️ ${m.aliasWarn}`,
  ];
  if (i.result.unresolved.length) {
    lines.push('', `## ${m.unconfirmed}`, '', `> ${m.unconfirmedNote}`, '');
    for (const u of i.result.unresolved) lines.push(`- [ ] ${esc(u)}`);
  }
  return lines.join('\n') + '\n';
}

function factRow(f: Fact, m: Msg): string {
  const status = f.status === 'confirmed' ? '✓ confirmed' : '**unconfirmed**';
  const src = f.source ? `[link](${f.source})` : `_${m.unconfirmed}_`;
  return `| ${esc(f.id)} | ${esc(f.claim)} | ${f.grade} | ${src} | ${status} |`;
}

function factsDoc(i: DossierInput, m: Msg, at: string): string {
  const fs = i.result.facts;
  const confirmed = fs.facts.filter(f => f.status === 'confirmed');
  const unconfirmed = fs.facts.filter(f => f.status !== 'confirmed');
  const head = `| ${m.hId} | ${m.hClaim} | ${m.hGrade} | ${m.hSource} | ${m.hStatus} |\n|---|---|---|---|---|`;
  const lines = [
    header(m.factsTitle, m, i.root, at, m.srcEditable('facts.json')),
    '',
    `> ${m.factsRule}`,
    `> ${m.gradeKey}`,
    '',
    `**${m.definition}:** ${esc(fs.definition) || `_${m.unconfirmed}_`}`,
    '',
    head,
    ...confirmed.map(f => factRow(f, m)),
    ...unconfirmed.map(f => factRow(f, m)),
  ];
  if (fs.doNotClaim?.length) {
    lines.push('', `## ${m.doNotClaim}`, '');
    for (const d of fs.doNotClaim) lines.push(`- ${esc(d)}`);
  }
  return lines.join('\n') + '\n';
}

function competitorsDoc(i: DossierInput, m: Msg, at: string): string {
  const lines = [
    header(m.competitorsTitle, m, i.root, at, m.src('brand.json')),
    '',
    `> ${m.compNote}`,
    '',
    `| ${m.hCompetitor} | ${m.hConfidence} | ${m.hWhy} | ${m.hReview} |`,
    '|---|---|---|---|',
    ...i.result.competitorCandidates.map(c =>
      `| ${esc(c.name)} | ${c.confidence} | ${esc(c.why)} | [ ] |`),
  ];
  const tracked = i.result.brand.competitors ?? [];
  lines.push('', `## ${m.tracked}`, '');
  lines.push(tracked.length ? tracked.map(c => `- ${esc(c.name)}`).join('\n') : `_${m.none}_`);
  return lines.join('\n') + '\n';
}

function questionsDoc(i: DossierInput, m: Msg, at: string): string {
  const lines = [
    header(m.questionsTitle, m, i.root, at, m.src('questions.json')),
    '',
    `> ${m.qNote}`,
    `> ⚠️ ${m.qSeriesWarn}`,
    '',
  ];
  for (const market of ['cn', 'global'] as const) {
    const qs = i.result.questions.filter(q => q.market === market);
    if (!qs.length) continue;
    lines.push(`## ${market === 'cn' ? m.marketCn : m.marketGlobal} (${qs.length})`, '');
    lines.push(`| ${m.hQuestion} | ${m.hGroup} | ${m.hProbe} |`, '|---|---|---|');
    for (const q of qs) lines.push(`| ${esc(q.text)} | ${esc(q.group)} | ${q.brandInQuestion ? '●' : ''} |`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Voice: evidence + empty slots. Deliberately not generated.
 * Picks mid-length sentences — the shortest are fragments and the longest are
 * usually lists, and neither shows how a brand actually sounds.
 */
function voiceDoc(i: DossierInput, m: Msg, at: string): string {
  const sentences = (i.pages ?? [])
    .flatMap(p => (p.text ?? '').split(/(?<=[.!?。！？])\s+/))
    .map(s => s.trim())
    .filter(s => s.length >= 30 && s.length <= 180)
    .slice(0, 8);
  const lines = [
    header(m.voiceTitle, m, i.root, at, m.srcYours, m.voiceIntro),
    '',
    '',
    `## ${m.voiceFill}`,
    '',
  ];
  for (const slot of m.voiceSlots) lines.push(`**${slot}**\n\n_${m.todo}_\n`);
  if (sentences.length) {
    lines.push(`## ${m.voiceEvidence}`, '');
    for (const s of sentences) lines.push(`> ${esc(s)}`, '');
  }
  return lines.join('\n');
}

/** Render the five-document dossier. Filenames are stable and safe to diff. */
export function renderDossier(input: DossierInput): Dossier {
  const m: Msg = input.lang === 'zh' ? M.zh : M.en;
  const at = (input.generatedAt ?? new Date().toISOString()).slice(0, 10);
  return {
    'product.md': productDoc(input, m, at),
    'facts.md': factsDoc(input, m, at),
    'competitors.md': competitorsDoc(input, m, at),
    'questions.md': questionsDoc(input, m, at),
    'voice.md': voiceDoc(input, m, at),
  };
}

/**
 * Read facts.md back into fact records, so correcting the document is the way
 * you correct the data — the promise the document makes in its own header.
 *
 * Only facts.md round-trips today. The others declare JSON as their source of
 * truth in their headers rather than implying an edit will take effect.
 *
 * Unparseable rows are returned separately instead of dropped: silently losing
 * a fact a human wrote by hand is the worst failure this function could have.
 */
export function parseFactsMd(md: string): { facts: Fact[]; definition?: string; skipped: string[] } {
  const facts: Fact[] = [];
  const skipped: string[] = [];
  let definition: string | undefined;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const def = line.match(/^\*\*.+?:\*\*\s*(.+)$/);
    if (def && definition === undefined && !line.startsWith('|')) {
      const v = def[1].trim();
      if (v && !/^_/.test(v)) definition = v;
      continue;
    }
    if (!line.startsWith('|') || /^\|\s*-+/.test(line)) continue;
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
    if (cells.length !== 5) continue;
    const [id, claim, grade, source, status] = cells;
    if (!id || /^(ID|编号)$/i.test(id)) continue;
    if (!/^[A-E]$/.test(grade)) { skipped.push(line); continue; }
    if (!claim) { skipped.push(line); continue; }
    const url = source.match(/\((https?:\/\/[^)]+)\)/)?.[1];
    facts.push({
      id, claim,
      grade: grade as EvidenceGrade,
      ...(url ? { source: url } : {}),
      status: /unconfirmed/i.test(status) ? 'unconfirmed' : 'confirmed',
    });
  }
  return { facts, ...(definition ? { definition } : {}), skipped };
}
