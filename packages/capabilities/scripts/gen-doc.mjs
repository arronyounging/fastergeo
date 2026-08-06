#!/usr/bin/env node
/**
 * Write the capability map out as a document.
 *
 *   node packages/capabilities/scripts/gen-doc.mjs [outfile]
 *
 * Generated rather than written, because the hand-maintained version of this
 * was wrong within a day: a planning file warned that two workbenches would
 * split into two products while both kept being built. A map that is generated
 * from the same data the panel reads cannot drift from it without a test going
 * red.
 */
import { writeFileSync } from 'node:fs';
import { CAPABILITIES, summarise, byDomain } from '../dist/index.js';

const OUT = process.argv[2]
  ?? new URL('../../../../Custyle/产品/GEO平台/22_能力与面板映射_generated.md', import.meta.url).pathname;

const DOMAIN = {
  core: '基础 · 所有能力都先读这一层',
  demand: '需求 · 谁在找你',
  visible: '可见 · AI 怎么说你',
  content: '内容 · 写什么、敢不敢发',
  convert: '转化',
  authority: '权威 · AI 信任谁',
  distribute: '分发',
  watch: '监测',
  social: '社交',
};
const SURFACE = { web: '✅ 网页可达', cli: '⌨️ 仅命令行', none: '⛔ 决定不做' };

const s = summarise();
const groups = byDomain();
const order = ['core', 'visible', 'demand', 'content', 'authority', 'watch', 'distribute', 'convert', 'social'];

const rows = c => '| ' + [
  `\`${c.id}\``,
  c.zh,
  c.valueZh,
  SURFACE[c.surface],
  c.block ? `\`${c.block}\`` : '—',
  c.needs.length ? c.needs.join('、') : '—',
  c.gap ?? '',
].join(' | ') + ' |';

const out = `# 能力 → 面板映射

> **这份文档是生成的，不要手改。**
> 数据源：\`packages/capabilities/src/index.ts\`，重新生成：
> \`node packages/capabilities/scripts/gen-doc.mjs\`
>
> 手写的版本活不过一天 —— 之前有一条「两个工作台会分裂成两个产品」的警告在规划文档里躺了一整天，
> 而两个工作台还在各自继续建。这份从面板读的同一份数据生成，对不上就有测试报红。

## 一句话现状

**${s.total} 个能力单元** · 网页可达 **${s.web}** · 仅命令行 **${s.cli}** · 决定不做 **${s.none}**

**${s.unsurfaced.length} 个能力真实存在但网页用户看不到** —— 这是路线图，不需要谁记得去写。

${order.filter(d => groups[d]).map(d => `
## ${DOMAIN[d]}

| 能力 | 是什么 | 给用户的价值 | 在哪 | 面板块 | 需要什么数据 | 差什么 |
|---|---|---|---|---|---|---|
${groups[d].map(rows).join('\n')}
`).join('')}

## 网页看不到的 ${s.unsurfaced.length} 个（按「补什么最划算」排）

${s.unsurfaced.map(c => `- **${c.zh}** — ${c.gap}\n  · 价值：${c.valueZh}\n  · 需要：${c.needs.join('、') || '无额外数据'}`).join('\n')}

## 面板上没有能力挂靠的块

${s.orphanBlocks.length
  ? s.orphanBlocks.map(b => `- \`${b}\``).join('\n') + `

这两块本来就不是能力：\`profile.rules\` 是我们做出的承诺，\`evidence.notrun\` 陈述的是一个缺席。
为了让数字好看而把它们硬说成能力，正是这份映射要防的事。`
  : '（无）'}

---

_生成于 ${new Date().toISOString().slice(0, 10)}_
`;

writeFileSync(OUT, out, 'utf8');
console.log(`${s.total} capabilities → ${OUT}`);
