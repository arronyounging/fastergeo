import { describe, it, expect } from 'vitest';
import { brief, runPrompt, parseRun, order, tierOf, summarise, capPriority, converge, humanise, TIERS } from '../src/index.js';

const g = {
  url: 'https://x.com', lang: 'zh' as const,
  brand: { name: 'X', description: 'sells things', industry: 'SaaS' },
  facts: [{ claim: 'founded 2019', grade: 'A', status: 'confirmed' },
          { claim: 'unknown thing', grade: 'E', status: 'unconfirmed' }],
  competitors: [{ name: 'Y' }],
  questions: [{ text: 'best tool for z', brandInQuestion: false }],
  audit: { avgScore: 49.8, pages: 5, issues: ['no definition block'] },
  probe: { question: 'what is X', verdict: 'unknown', answer: 'never heard of it', engine: 'deepseek' },
  breakAt: 'discoverable',
};

describe('brief', () => {
  it('carries only confirmed facts — an E grade is our ignorance, not a fact', () => {
    const b = brief(g);
    expect(b).toContain('founded 2019');
    expect(b).not.toContain('unknown thing');
  });

  it('labels the guesses as guesses so a methodology does not build on them', () => {
    expect(brief(g)).toMatch(/COMPETITORS.*unconfirmed/);
    expect(brief(g)).toMatch(/INDUSTRY.*unconfirmed/);
  });

  it('quotes the engine verbatim rather than only its verdict', () => {
    expect(brief(g)).toContain('never heard of it');
  });
});

describe('runPrompt', () => {
  it('demands relevance and missing-data before any conclusion', () => {
    const p = runPrompt('pricing', { sections: [{ h: 'Method', b: 'do the thing' }] }, g);
    const applies = p.indexOf('apply to this business');
    const needs = p.indexOf('have NOT been given');
    const finding = p.indexOf('Only then, the finding');
    expect(applies).toBeGreaterThan(0);
    expect(needs).toBeGreaterThan(applies);
    expect(finding).toBeGreaterThan(needs);
  });

  it('forbids inventing the things a marketing model most wants to invent', () => {
    const p = runPrompt('pricing', { sections: [] }, g);
    expect(p).toMatch(/Never invent a number, a customer, a competitor/);
  });
});

describe('parseRun', () => {
  it('turns an unusable reply into a visible blocked row, never a throw', () => {
    // One skill failing must not take down a 69-step pipeline, and a failed row
    // is more use than a silently missing one.
    const r = parseRun('cro', 'convert', 'not json at all');
    expect(r.status).toBe('blocked');
    expect(r.error).toBeTruthy();
  });

  it('clamps a runaway reply', () => {
    const r = parseRun('cro', 'convert', {
      status: 'ran', verdict: 'v',
      findings: Array.from({ length: 40 }, () => ({ claim: 'c', evidence: 'e' })),
      actions: Array.from({ length: 40 }, () => ({ do: 'd', doneWhen: 'w', priority: 'P9' })),
      needs: Array.from({ length: 40 }, () => 'n'),
    });
    expect(r.findings.length).toBeLessThanOrEqual(5);
    expect(r.actions.length).toBeLessThanOrEqual(4);
    expect(r.actions[0].priority).toBe('P1');
  });

  it('drops findings with no claim rather than rendering empty rows', () => {
    const r = parseRun('cro', 'convert', { status: 'ran', verdict: 'v', findings: [{ evidence: 'e' }] });
    expect(r.findings).toHaveLength(0);
  });
});

describe('order', () => {
  it('runs strategy first — every other methodology applies itself to a guess without it', () => {
    const o = order(['cro', 'product-marketing', 'ai-seo'], 'discoverable');
    expect(o[0]).toBe('product-marketing');
  });

  it('puts the broken station ahead of the rest', () => {
    const o = order(['cro', 'ai-seo', 'analytics'], 'discoverable');
    expect(o[0]).toBe('ai-seo');
  });
});

describe('tiers', () => {
  it('places every skill in exactly one tier', () => {
    const seen = new Set<string>();
    for (const t of TIERS) for (const s of t.skills) {
      expect(seen.has(s), s).toBe(false);
      seen.add(s);
    }
  });
  it('falls back rather than losing an unmapped skill', () => {
    expect(tierOf('brand-new-skill')).toBe('strategy');
  });
});

describe('summarise', () => {
  it('ranks every action across every methodology into one list', () => {
    const s = summarise([
      parseRun('cro', 'convert', { status: 'ran', verdict: 'v', actions: [{ do: 'b', doneWhen: 'w', priority: 'P2' }] }),
      parseRun('ai-seo', 'discover', { status: 'ran', verdict: 'v', actions: [{ do: 'a', doneWhen: 'w', priority: 'P0' }] }),
    ]);
    expect(s.actions[0].do).toBe('a');
    expect(s.actions[0].tier).toBe('discover');
  });

  it('dedupes what the whole engine says it lacks', () => {
    const s = summarise([
      parseRun('a', 'x', { status: 'partial', verdict: 'v', needs: ['GA4 access'] }),
      parseRun('b', 'x', { status: 'partial', verdict: 'v', needs: ['GA4  access'] }),
    ]);
    expect(s.needs).toHaveLength(1);
  });
});

describe('capPriority', () => {
  it('will not let a methodology below the break claim today', () => {
    // A real run had pricing conclude "pricing is secondary, nobody can find
    // you" and then issue a P0 for a 500-response survey. Both cannot be true.
    const runs = [parseRun('pricing', 'convert', {
      status: 'partial', verdict: 'v',
      actions: [{ do: 'survey 500 people', doneWhen: '500 replies', priority: 'P0' }],
    })];
    const [r] = capPriority(runs, 'discoverable');
    expect(r.actions[0].priority).toBe('P1');
    expect(r.actions[0].doneWhen).toContain('断点下游');
  });

  it('leaves the broken tier and strategy alone', () => {
    const runs = [
      parseRun('ai-seo', 'discover', { status: 'ran', verdict: 'v', actions: [{ do: 'a', doneWhen: 'w', priority: 'P0' }] }),
      parseRun('product-marketing', 'strategy', { status: 'ran', verdict: 'v', actions: [{ do: 'b', doneWhen: 'w', priority: 'P0' }] }),
    ];
    for (const r of capPriority(runs, 'discoverable')) expect(r.actions[0].priority).toBe('P0');
  });

  it('does nothing when no station is diagnosed as broken', () => {
    const runs = [parseRun('cro', 'convert', { status: 'ran', verdict: 'v', actions: [{ do: 'a', doneWhen: 'w', priority: 'P0' }] })];
    expect(capPriority(runs, null)[0].actions[0].priority).toBe('P0');
  });
});

describe('converge', () => {
  it('ranks agreement above confidence', () => {
    // A real run had four unrelated playbooks each land on "publish a comparison
    // page against ElevenLabs" while a single one shouted P0 about something
    // else. The lone confident voice is the one most likely to be wrong.
    const acts = [
      { do: '发一篇独立的定价白皮书', doneWhen: 'x', priority: 'P0' as const, skill: 'pricing', tier: 'convert' },
      { do: '做一个和 ElevenLabs 的对比页面', doneWhen: 'a', priority: 'P1' as const, skill: 'competitors', tier: 'strategy' },
      { do: '在官网新增对比 ElevenLabs 的页面', doneWhen: 'b', priority: 'P1' as const, skill: 'competitor-analysis', tier: 'strategy' },
      { do: '新增一个 ElevenLabs 对比页面', doneWhen: 'c', priority: 'P1' as const, skill: 'customer-research', tier: 'strategy' },
    ];
    const c = converge(acts);
    expect(c[0].skills.length).toBe(3);
    expect(c[0].do).toContain('ElevenLabs');
    expect(c[0].variants.length).toBe(3);
  });

  it('keeps unrelated actions apart rather than merging them into mush', () => {
    const c = converge([
      { do: '补 FAQ 抽取块', doneWhen: 'x', priority: 'P1' as const, skill: 'a', tier: 't' },
      { do: '降低移动端 LCP', doneWhen: 'y', priority: 'P1' as const, skill: 'b', tier: 't' },
    ]);
    expect(c).toHaveLength(2);
  });

  it('keeps every phrasing so a reader can check the merge', () => {
    const c = converge([
      { do: '添加 Organization schema 标记', doneWhen: 'x', priority: 'P1' as const, skill: 'a', tier: 't' },
      { do: '添加 Organization schema 结构化数据', doneWhen: 'y', priority: 'P1' as const, skill: 'b', tier: 't' },
    ]);
    expect(c[0].variants).toHaveLength(2);
  });
});

describe('converge threshold', () => {
  it('sits in the empty space between real matches and unrelated ones', () => {
    // The margin is the whole justification for the number. If a future change
    // to tokenisation narrows it, this fails before the clustering silently
    // starts merging unrelated work.
    const same = converge([
      { do: '做一个和 ElevenLabs 的对比页面', doneWhen: 'x', priority: 'P1' as const, skill: 'a', tier: 't' },
      { do: '在官网新增对比 ElevenLabs 的页面', doneWhen: 'x', priority: 'P1' as const, skill: 'b', tier: 't' },
    ]);
    expect(same).toHaveLength(1);
    const apart = converge([
      { do: '补 FAQ 抽取块', doneWhen: 'x', priority: 'P1' as const, skill: 'a', tier: 't' },
      { do: '降低移动端 LCP', doneWhen: 'x', priority: 'P1' as const, skill: 'b', tier: 't' },
      { do: '在定价页写明商用授权条款', doneWhen: 'x', priority: 'P1' as const, skill: 'c', tier: 't' },
    ]);
    expect(apart).toHaveLength(3);
  });
});

describe('converge does not chain', () => {
  it('refuses to let one cluster swallow the run', () => {
    // A real run collapsed 59 of 202 actions into one "add a publish date"
    // cluster: the shared opener 在页面添加 was doing all the matching. Document
    // frequency is what separates a generic verb phrase from a real subject,
    // and it needs a real corpus — so this is sized like one rather than like a
    // toy, because at four items "ElevenLabs" and "在页面添加" occur equally often
    // and no frequency rule can tell them apart.
    const mk = (do_: string, skill: string) =>
      ({ do: do_, doneWhen: 'x', priority: 'P1' as const, skill, tier: 't' });
    const acts = [
      mk('在页面添加发布日期', 's1'), mk('在页面添加作者署名', 's2'),
      mk('在页面添加外部引用链接', 's3'), mk('在页面添加 FAQ 抽取块', 's4'),
      mk('在页面添加定义抽取块', 's5'), mk('在页面添加对比表格', 's6'),
      mk('降低移动端 LCP 到 2.5 秒以内', 's7'), mk('压缩首屏图片体积', 's8'),
      mk('给产品页补 Organization schema', 's9'), mk('给产品页补 Product schema', 's10'),
      mk('在定价页写明商用授权条款', 's11'), mk('在定价页写明退款政策', 's12'),
      mk('做一个 ElevenLabs 对比页面', 's13'), mk('新增 ElevenLabs 对比页面', 's14'),
      mk('设置关键词排名追踪', 's15'), mk('接入 Search Console', 's16'),
    ];
    const c = converge(acts);
    // Nothing may eat a quarter of the run.
    expect(Math.max(...c.map(x => x.skills.length))).toBeLessThanOrEqual(4);
    // And the two genuine restatements still find each other.
    expect(c.some(x => x.skills.length >= 2 && /ElevenLabs/i.test(x.do))).toBe(true);
  });
});

describe('humanise', () => {
  it('never lets an internal code reach a prompt', () => {
    // A real run turned block-gap:comparison into "check the block-gap property
    // in your CSS" — confident, actionable, and about nothing.
    expect(humanise('block-gap:comparison')).toMatch(/comparison block/);
    expect(humanise('block-gap:comparison')).not.toMatch(/block-gap/);
  });
  it('falls back for a code it has never seen rather than passing it through raw', () => {
    expect(humanise('some-new:code')).toBe('some new code');
  });
  it('leaves prose alone', () => {
    expect(humanise('robots.txt blocks GPTBot')).toBe('robots.txt blocks GPTBot');
  });
});
