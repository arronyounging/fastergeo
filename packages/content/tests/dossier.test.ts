import { describe, it, expect } from 'vitest';
import { renderDossier, parseFactsMd } from '../src/dossier.js';
import type { BootstrapResult } from '../src/bootstrap.js';

const RESULT: BootstrapResult = {
  brand: {
    name: 'Custyle',
    aliases: ['custyle.ai'],
    domains: ['custyle.ai'],
    description: 'AI custom merch platform',
    industry: 'E-commerce',
    competitors: [{ name: 'Printful', aliases: [] }],
  },
  competitorCandidates: [
    { name: 'Printful', confidence: 'high', why: 'named on the pricing page', needsReview: true },
    { name: 'Kittl', confidence: 'low', why: 'mentioned once in a blog post', needsReview: true },
  ],
  facts: {
    brand: 'Custyle',
    definition: 'Custyle turns a described vibe into printed merch.',
    facts: [
      { id: 'F-001', claim: 'Prices run 29.00 to 54.99 USD', grade: 'A', source: 'https://custyle.ai/pricing', status: 'confirmed' },
      { id: 'F-002', claim: 'Supports 18 product categories', grade: 'A', source: 'https://custyle.ai', status: 'confirmed' },
      { id: 'F-003', claim: 'Founded in 2024', grade: 'E', status: 'unconfirmed' },
    ],
    doNotClaim: ['fastest in the industry'],
  },
  questions: [
    { id: 'Q-1', group: '推荐', market: 'cn', text: '定制T恤哪家好？', brandInQuestion: false },
    { id: 'Q-2', group: '品牌验证', market: 'global', text: 'What is Custyle?', brandInQuestion: true },
  ],
  unresolved: ['founding year', 'team size'],
};

describe('renderDossier', () => {
  const d = renderDossier({ result: RESULT, root: 'https://custyle.ai', generatedAt: '2026-08-04T00:00:00Z' });

  it('produces exactly the five documents', () => {
    expect(Object.keys(d).sort()).toEqual(
      ['competitors.md', 'facts.md', 'product.md', 'questions.md', 'voice.md']);
  });

  it('shows every fact with its grade, source and status', () => {
    expect(d['facts.md']).toContain('F-001');
    expect(d['facts.md']).toContain('https://custyle.ai/pricing');
    expect(d['facts.md']).toContain('unconfirmed');
    expect(d['facts.md']).toContain('fastest in the industry'); // doNotClaim carried through
  });

  it('names what the site did not say instead of quietly omitting it', () => {
    expect(d['product.md']).toContain('founding year');
    expect(d['product.md']).toContain('team size');
  });

  it('marks every competitor as a guess needing review', () => {
    expect(d['competitors.md']).toContain('Printful');
    expect(d['competitors.md']).toContain('[ ]');
    // The document must say where a real competitive set comes from.
    expect(d['competitors.md']).toMatch(/sampling AI answers/i);
  });

  it('flags probe questions and warns that editing the bank breaks comparability', () => {
    expect(d['questions.md']).toContain('What is Custyle?');
    expect(d['questions.md']).toContain('●'); // probe marker
    expect(d['questions.md']).toMatch(/new measurement series/i);
  });

  it('does not invent a voice guide — it ships empty slots', () => {
    expect(d['voice.md']).toMatch(/scaffold, not a generated voice guide/i);
    expect(d['voice.md']).toContain('to fill in');
  });

  it('tells the reader their edits survive a re-run, and never claims to regenerate voice.md from itself', () => {
    // The header of an editable document is a promise. Both halves must hold.
    expect(d['facts.md']).toMatch(/will not overwrite your edits/i);
    expect(d['voice.md']).toMatch(/This file is yours/i);
    expect(d['voice.md']).not.toMatch(/regenerated from it/i); // circular nonsense
  });

  it('quotes real site sentences as voice evidence when pages are supplied', () => {
    const withPages = renderDossier({
      result: RESULT, root: 'https://custyle.ai',
      pages: [{ url: 'https://custyle.ai', title: 'Custyle', text: 'We think making something yours should take a minute, not a design degree. Short.' }],
    });
    expect(withPages['voice.md']).toContain('should take a minute');
    expect(withPages['voice.md']).not.toContain('> Short.'); // too short to show voice
  });

  it('renders Chinese when lang=zh', () => {
    const zh = renderDossier({ result: RESULT, root: 'https://custyle.ai', lang: 'zh' });
    expect(zh['facts.md']).toContain('品牌事实库');
    expect(zh['product.md']).toContain('网站上没找到');
  });

  it('escapes pipes so a claim containing one cannot break the table', () => {
    const piped = renderDossier({
      result: {
        ...RESULT,
        facts: { ...RESULT.facts, facts: [{ id: 'F-9', claim: 'a | b', grade: 'A', status: 'confirmed' }] },
      },
      root: 'https://x.com',
    });
    const row = piped['facts.md'].split('\n').find(l => l.includes('F-9'))!;
    expect(row.split(/(?<!\\)\|/).length - 1).toBe(6); // 5 cells → 6 delimiters
  });
});

describe('parseFactsMd — the document is the source of truth it claims to be', () => {
  it('round-trips every fact rendered', () => {
    const md = renderDossier({ result: RESULT, root: 'https://custyle.ai' })['facts.md'];
    const back = parseFactsMd(md);
    expect(back.facts).toHaveLength(3);
    expect(back.skipped).toEqual([]);
    expect(back.facts[0]).toEqual({
      id: 'F-001', claim: 'Prices run 29.00 to 54.99 USD',
      grade: 'A', source: 'https://custyle.ai/pricing', status: 'confirmed',
    });
    expect(back.facts.find(f => f.id === 'F-003')?.status).toBe('unconfirmed');
    expect(back.definition).toBe('Custyle turns a described vibe into printed merch.');
  });

  it('picks up a fact a human typed by hand', () => {
    const md = renderDossier({ result: RESULT, root: 'https://custyle.ai' })['facts.md']
      + '| F-004 | Ships from three countries | A | [link](https://custyle.ai/shipping) | ✓ confirmed |\n';
    const back = parseFactsMd(md);
    expect(back.facts.map(f => f.id)).toContain('F-004');
    expect(back.facts.find(f => f.id === 'F-004')?.source).toBe('https://custyle.ai/shipping');
  });

  it('reports malformed rows instead of dropping them silently', () => {
    const md = '| ID | Claim | Grade | Source | Status |\n|---|---|---|---|---|\n'
      + '| F-1 | fine | A | — | ✓ confirmed |\n'
      + '| F-2 | bad grade | Z | — | ✓ confirmed |\n';
    const back = parseFactsMd(md);
    expect(back.facts.map(f => f.id)).toEqual(['F-1']);
    expect(back.skipped).toHaveLength(1);
    expect(back.skipped[0]).toContain('F-2');
  });
});
