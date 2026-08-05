/**
 * Outline generation: target question + fact store → structured outline.
 *
 * Deterministic skeleton (works with zero API keys) with optional LLM
 * enrichment. Structure encodes the empirical citation patterns: answer-first
 * opening, definition + statistics + comparison blocks, FAQ tail, 134–167
 * word-equivalent self-contained sections.
 */

import { isCjkDominant } from '@fastergeo/rules/text';
import type { FactStore, Outline } from './types.js';

export function buildOutline(question: string, store: FactStore): Outline {
  const zh = isCjkDominant(question);
  const brand = store.brand;
  const confirmed = store.facts.filter(f => f.status === 'confirmed' && f.grade !== 'E');
  const statFacts = confirmed.filter(f => /\d/.test(f.claim)).map(f => f.id);

  return {
    question,
    market: zh ? 'cn' : 'global',
    targetWordCount: 1500,
    titleCandidates: zh
      ? [
          `${question.replace(/[？?]$/, '')}：完整指南（含对比与选型建议）`,
          `${question.replace(/[？?]$/, '')}？一文说清定义、方法与常见误区`,
        ]
      : [
          `${question.replace(/\?$/, '')}: The Complete Guide`,
          `${question.replace(/\?$/, '')}? Definitions, Comparisons, and How to Choose`,
        ],
    sections: [
      {
        heading: zh ? '直接回答（首屏）' : 'The Short Answer',
        requiredBlocks: ['definition'],
        factIds: [],
        notes: zh
          ? `前 40-60 词等效内直接给答案；${brand} 的一句话定义必须与官网首屏/JSON-LD 逐字一致：「${store.definition}」`
          : `Answer within the first 40-60 words; use the canonical definition verbatim: "${store.definition}"`,
      },
      {
        heading: zh ? `${question.replace(/[？?]$/, '')}的关键事实` : 'Key Facts and Numbers',
        requiredBlocks: ['statistics'],
        factIds: statFacts,
        notes: zh ? '每 500 词等效至少 1 个带来源的数据点；只用事实库已确认条目' : 'Only confirmed facts; every number carries its source',
      },
      {
        heading: zh ? '方案对比' : 'How the Options Compare',
        requiredBlocks: ['comparison'],
        factIds: [],
        notes: zh ? '必须有 Markdown 对比表；亮点与局限并陈，不单边吹捧' : 'Comparison table required; strengths AND limitations',
      },
      {
        heading: zh ? '怎么开始（步骤）' : 'How to Get Started',
        requiredBlocks: ['steps'],
        factIds: [],
        notes: zh ? '3-5 个有序步骤' : '3-5 ordered steps',
      },
      {
        heading: zh ? '常见问题' : 'FAQ',
        requiredBlocks: ['faq'],
        factIds: [],
        notes: zh ? '3-4 组问答；答案自足可独立抽取（134-167 词等效）' : '3-4 Q&As, each self-contained (134-167 words)',
      },
    ],
  };
}

/** Render outline + constraints as an LLM drafting prompt (信任型模板精神). */
/**
 * @param voice the user's own voice guide, verbatim. Optional because it is a
 *   document we refuse to generate — if the user never filled it in, drafting
 *   proceeds without it rather than inventing a house style for them.
 */
export function draftPrompt(outline: Outline, store: FactStore, voice?: string): string {
  const zh = outline.market === 'cn';
  const factsBlock = store.facts
    .filter(f => f.status === 'confirmed' && f.grade !== 'E')
    .map(f => `- [${f.id}|${f.grade}] ${f.claim}${f.source ? `（来源: ${f.source}）` : ''}`)
    .join('\n');
  const sections = outline.sections
    .map(s => `## ${s.heading}\n  必含块: ${s.requiredBlocks.join('/')}${s.notes ? `\n  要求: ${s.notes}` : ''}`)
    .join('\n');

  return [
    zh
      ? `你是 GEO 内容策略专家，为品牌「${store.brand}」写一篇可被 AI 搜索系统引用的答案型文章。`
      : `You are a GEO content strategist writing an AI-citable article for the brand "${store.brand}".`,
    '',
    zh ? `目标问题：${outline.question}` : `Target question: ${outline.question}`,
    zh ? `目标长度：${outline.targetWordCount} 词等效，Markdown 输出` : `Target length: ~${outline.targetWordCount} words, Markdown`,
    '',
    zh ? '【唯一事实来源 — 只允许使用下列已确认事实，禁止编造任何数字/案例/评价】' : '[SOLE FACT SOURCE — use ONLY these confirmed facts; never invent numbers/cases/reviews]',
    factsBlock || (zh ? '（无可用事实——文章不得包含任何品牌具体数据）' : '(none — the article must not contain brand-specific data)'),
    '',
    zh ? '【结构（按大纲，每节开头直接给结论）】' : '[STRUCTURE — answer-first in every section]',
    sections,
    '',
    // The user wrote this by hand; it is the one part of the prompt we did not
    // derive. Passed through verbatim rather than summarised.
    ...(voice?.trim()
      ? [zh ? '【语气 — 品牌自己写的，照此写作】' : '[VOICE — written by the brand; follow it]', voice.trim(), '']
      : []),
    zh
      ? '【红线】没把握的数据不写；不贬低具体竞品；最高级表述（最好/第一/领先）除非事实库背书否则禁用。'
      : '[HARD RULES] No unsourced data. No competitor disparagement. No superlatives unless backed by a listed fact.',
  ].join('\n');
}
