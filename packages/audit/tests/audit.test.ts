import { describe, it, expect } from 'vitest';
import { extractFeatures, detectBlocks } from '../src/extract.js';
import { scorePage } from '../src/score.js';
import { blockedAiCrawlersFromRobots } from '../src/site.js';

const GOOD_ZH_PAGE = `<!doctype html><html lang="zh-CN"><head>
<title>什么是生成式引擎优化：完整指南</title>
<meta name="description" content="生成式引擎优化（GEO）让 AI 在回答时主动引用你的品牌。">
<link rel="canonical" href="https://example.com/geo-guide">
<script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"李雷"},"datePublished":"2026-07-01"}</script>
</head><body>
<h1>什么是生成式引擎优化</h1>
<p>生成式引擎优化是指让 AI 引擎在回答用户问题时主动引用品牌的方法论。研究显示，含数据的页面被引用概率提升 61.6%。</p>
<h2>GEO 和 SEO 的区别是什么？</h2>
<p>两者的对比如下表。</p>
<table><tr><td>GEO</td><td>SEO</td></tr></table>
<h2>如何开始？</h2>
<p>第一步，先做站点体检。然后逐引擎采样。接着生成工单。</p>
<ul><li>体检</li><li>采样</li><li>工单</li></ul>
<h2>常见问题</h2>
<p>${'这里是足够长的正文内容，用来把词数推到三百词等效以上。'.repeat(30)}</p>
<p>外部来源：<a href="https://arxiv.org/abs/2311.09735">GEO 论文</a> 与 <a href="https://ahrefs.com/blog">Ahrefs 研究</a>。</p>
<p><a href="/blog/other">站内文章</a></p>
</body></html>`;

const SHELL_PAGE = `<!doctype html><html><head><title>Product</title></head><body>
<div id="app">No products for this category</div>
<script>${'x'.repeat(120_000)}</script>
</body></html>`;

describe('extractFeatures', () => {
  const f = extractFeatures('https://example.com/geo-guide', 200, GOOD_ZH_PAGE);

  it('extracts head metadata', () => {
    expect(f.title).toContain('生成式引擎优化');
    expect(f.metaDescription).toContain('GEO');
    expect(f.canonical).toBe('https://example.com/geo-guide');
    expect(f.lang).toBe('zh-CN');
    expect(f.noindex).toBe(false);
  });

  it('extracts structure and JSON-LD types', () => {
    expect(f.h1).toHaveLength(1);
    expect(f.h2).toHaveLength(3);
    expect(f.jsonLdTypes).toContain('Article');
    expect(f.jsonLdTypes).toContain('Person');
    expect(f.tableCount).toBe(1);
    expect(f.listCount).toBe(1);
  });

  it('counts CJK text as word-equivalents', () => {
    expect(f.wordCount).toBeGreaterThan(300);
  });

  it('classifies internal vs external links', () => {
    expect(f.externalLinkCount).toBe(2);
    expect(f.internalLinkCount).toBeGreaterThanOrEqual(1);
  });

  it('detects author and date signals', () => {
    expect(f.hasAuthor).toBe(true);
    expect(f.hasPublishDate).toBe(true);
  });
});

describe('detectBlocks', () => {
  it('detects all five block types on the fixture', () => {
    const f = extractFeatures('https://example.com/x', 200, GOOD_ZH_PAGE);
    const b = detectBlocks(f);
    expect(b.definition).toBe(true);   // 是指
    expect(b.statistics).toBe(true);   // 61.6%
    expect(b.comparison).toBe(true);   // 区别 + table
    expect(b.steps).toBe(true);        // 第一步/然后/接着
    expect(b.faq).toBe(true);          // 常见问题 heading
  });
});

describe('scorePage', () => {
  it('scores a well-formed page B or better', () => {
    const f = extractFeatures('https://example.com/geo-guide', 200, GOOD_ZH_PAGE);
    const audit = scorePage(f, detectBlocks(f));
    expect(audit.score).toBeGreaterThanOrEqual(70);
    expect(audit.blockers).toHaveLength(0);
  });

  it('flags SPA shells as blockers with D grade', () => {
    const f = extractFeatures('https://example.com/products/hoodie', 200, SHELL_PAGE);
    const audit = scorePage(f, detectBlocks(f));
    expect(audit.grade).toBe('D');
    expect(audit.blockers.some(b => b.startsWith('spa-shell'))).toBe(true);
  });

  it('reports relevance as unmeasured without a question bank', () => {
    const f = extractFeatures('https://example.com/x', 200, GOOD_ZH_PAGE);
    const audit = scorePage(f, detectBlocks(f));
    const rel = audit.dimensions.find(d => d.key === 'relevance');
    expect(rel?.score).toBeNull();
  });

  it('measures relevance coverage against a Chinese question bank', () => {
    const f = extractFeatures('https://example.com/x', 200, GOOD_ZH_PAGE);
    const audit = scorePage(f, detectBlocks(f), ['什么是生成式引擎优化？', 'GEO 和 SEO 有什么区别？']);
    const rel = audit.dimensions.find(d => d.key === 'relevance');
    expect(rel?.score).toBeGreaterThan(5);
  });
});

describe('blockedAiCrawlersFromRobots', () => {
  it('detects per-agent full disallow', () => {
    const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n';
    expect(blockedAiCrawlersFromRobots(robots)).toEqual(['GPTBot']);
  });

  it('detects wildcard full disallow blocking everything', () => {
    const robots = 'User-agent: *\nDisallow: /\n';
    expect(blockedAiCrawlersFromRobots(robots).length).toBe(9);
  });

  it('respects Allow: / overriding Disallow', () => {
    const robots = 'User-agent: ClaudeBot\nDisallow: /\nAllow: /\n';
    expect(blockedAiCrawlersFromRobots(robots)).toEqual([]);
  });

  it('returns empty for permissive robots', () => {
    expect(blockedAiCrawlersFromRobots('User-agent: *\nDisallow:\n')).toEqual([]);
  });
});

import { AI_CRAWLER_PURPOSES } from '../src/types.js';

describe('crawler purpose classification', () => {
  it('classifies all 9 crawlers with search/user crawlers identified', () => {
    expect(AI_CRAWLER_PURPOSES['OAI-SearchBot']).toBe('search-index');
    expect(AI_CRAWLER_PURPOSES['PerplexityBot']).toBe('search-index');
    expect(AI_CRAWLER_PURPOSES['ChatGPT-User']).toBe('user-request');
    expect(AI_CRAWLER_PURPOSES['GPTBot']).toBe('training');
    expect(AI_CRAWLER_PURPOSES['Google-Extended']).toBe('training');
    expect(Object.keys(AI_CRAWLER_PURPOSES)).toHaveLength(9);
  });
});


describe('report-derived checks (前30%/孤岛/新鲜度/实体层)', () => {
  it('extracts pronoun-start paragraphs, modifiedDate, sameAs count', () => {
    const html = `<html><head>
      <meta property="article:modified_time" content="2026-01-01T00:00:00Z">
      <script type="application/ld+json">{"@type":"Organization","name":"X","sameAs":["https://www.wikidata.org/wiki/Q1","https://linkedin.com/company/x"]}</script>
      </head><body>
      <p>Custyle is a platform.</p><p>It offers many products.</p><p>This makes it useful.</p>
      <p>这也是原因之一。</p><p>独立成义的段落。</p></body></html>`;
    const f = extractFeatures('https://a.com/', 200, html);
    expect(f.pronounStartParagraphs).toBe(3); // It / This / 这
    expect(f.modifiedDate).toBe('2026-01-01T00:00:00Z');
    expect(f.sameAsCount).toBe(2);
    expect(f.jsonLdTypes).toContain('Organization');
  });

  it('flags answer-below-fold only when blocks exist but not early', () => {
    const filler = 'word '.repeat(300);
    const html = `<html><body><p>${filler}</p><p>GEO is a discipline. 61.6% improvement.</p></body></html>`;
    const f = extractFeatures('https://a.com/x', 200, html);
    const early = detectBlocks({ ...f, text: f.text.slice(0, Math.ceil(f.text.length * 0.3)) });
    const audit = scorePage(f, detectBlocks(f), undefined, { earlyBlocks: early });
    const structure = audit.dimensions.find(d => d.key === 'structure')!;
    expect(structure.issues).toContain('answer-below-fold');
  });

  it('flags context-dependent paragraphs at ≥30% pronoun starts', () => {
    const ps = ['It is fast.', 'This helps.', 'They agree.', 'Standalone fact one.', 'Standalone fact two.']
      .map(t => `<p>${t}</p>`).join('');
    const f = extractFeatures('https://a.com/x', 200, `<html><body>${ps}</body></html>`);
    const audit = scorePage(f, detectBlocks(f));
    expect(audit.dimensions.find(d => d.key === 'structure')!.issues).toContain('context-dependent-paragraphs');
  });

  it('flags stale-content only when a stated dateModified is >90 days old', () => {
    const mk = (date: string) => extractFeatures('https://a.com/x', 200,
      `<html><head><meta property="article:modified_time" content="${date}"></head><body><p>x</p></body></html>`);
    const staleAudit = scorePage(mk('2020-01-01T00:00:00Z'), detectBlocks(mk('2020-01-01T00:00:00Z')));
    expect(staleAudit.dimensions.find(d => d.key === 'authority')!.issues).toContain('stale-content');
    const fresh = mk(new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString());
    const freshAudit = scorePage(fresh, detectBlocks(fresh));
    expect(freshAudit.dimensions.find(d => d.key === 'authority')!.issues).not.toContain('stale-content');
  });

  it('attaches page entity signals for site-level aggregation', () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","sameAs":["https://x.com/a"]}</script><p>hi</p>`;
    const f = extractFeatures('https://a.com/', 200, `<html><body>${html}</body></html>`);
    const audit = scorePage(f, detectBlocks(f));
    expect(audit.entity).toEqual({ organizationSchema: true, sameAsCount: 1 });
  });
});
