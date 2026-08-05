import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../src/compute.js';
import type { Sample } from '../src/types.js';

const sample = (over: Partial<Sample> = {}): Sample => ({
  providerId: 'deepseek', market: 'cn', questionId: 'q1',
  question: 'best seo tools', brandInQuestion: false,
  answer: 'Semrush is a good option.', citations: [],
  ...over,
});

describe('share of voice with no competitor set', () => {
  it('is undefined, not 100% — nobody looked for anyone else', async () => {
    // A real run against semrush.com reported shareOfVoice 1.0 on every engine
    // because the competitor set was empty, so competitorVoice could only be 0.
    // "You hold all of the conversation" is not what that measured.
    const r = await computeMetrics([sample()], {
      name: 'Semrush', aliases: [], domains: ['semrush.com'], competitors: [],
    });
    expect(r.platforms[0].mentionRate).toBe(1);
    expect(r.platforms[0].shareOfVoice).toBeNull();
  });

  it('is a real ratio once there is someone to share it with', async () => {
    const r = await computeMetrics(
      [sample({ answer: 'Semrush and Ahrefs are both good.' })],
      { name: 'Semrush', aliases: [], domains: ['semrush.com'],
        competitors: [{ name: 'Ahrefs', aliases: [] }] },
    );
    expect(r.platforms[0].shareOfVoice).toBeCloseTo(0.5, 5);
  });
});

describe('citation rate when the engine cannot cite', () => {
  it('is undefined, not 0% — thirteen of eighteen engines never return citations', async () => {
    // The CLI report rendered "0% Cited" for semrush across every engine. None
    // of those engines does web search; a zero there blames the brand for a
    // question the engine was never able to answer.
    const r = await computeMetrics([sample()], {
      name: 'Semrush', aliases: [], domains: ['semrush.com'], competitors: [],
    });
    expect(r.platforms[0].ownDomainCiteRate).toBeNull();
    expect(r.platforms[0].citationShare).toBeNull();
  });

  it('is a real rate once the engine returns citations', async () => {
    const r = await computeMetrics(
      [sample({ citations: ['https://semrush.com/blog', 'https://ahrefs.com/x'] })],
      { name: 'Semrush', aliases: [], domains: ['semrush.com'], competitors: [] },
    );
    expect(r.platforms[0].ownDomainCiteRate).toBe(1);
    expect(r.platforms[0].citationShare).toBeCloseTo(0.5, 5);
  });
});
