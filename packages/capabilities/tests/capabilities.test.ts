import { describe, it, expect } from 'vitest';
import { CAPABILITIES, BLOCKS, summarise, byDomain } from '../src/index.js';

describe('the capability map', () => {
  it('never points a capability at a panel block that does not exist', () => {
    // The whole value of this file is that it cannot drift from the panel. A
    // block id that no longer renders has to fail here rather than quietly
    // claim a capability is visible.
    const known = new Set<string>(BLOCKS);
    for (const c of CAPABILITIES) {
      if (c.block) expect(known.has(c.block), `${c.id} → ${c.block}`).toBe(true);
    }
  });

  it('gives every capability a reason a buyer would care', () => {
    for (const c of CAPABILITIES) {
      expect(c.valueZh.length, c.id).toBeGreaterThan(6);
      expect(c.valueEn.length, c.id).toBeGreaterThan(10);
    }
  });

  it('makes anything not on the hosted panel say what stands in the way', () => {
    // "cli" with no gap would be the same silence this file exists to remove.
    for (const c of CAPABILITIES) {
      if (c.surface !== 'web') expect(c.gap, c.id).toBeTruthy();
    }
  });

  it('does not let a web capability claim a gap it does not have', () => {
    const webWithGap = CAPABILITIES.filter(c => c.surface === 'web' && c.gap);
    // A few genuinely ship on the web in a reduced form; each must still name
    // the reduction rather than imply the full capability.
    for (const c of webWithGap) expect(c.gap!.length, c.id).toBeGreaterThan(8);
  });

  it('uses ids that are unique', () => {
    const ids = CAPABILITIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports how much of what we built a hosted user can actually reach', () => {
    const s = summarise();
    expect(s.total).toBe(CAPABILITIES.length);
    expect(s.web + s.cli + s.none).toBe(s.total);
    // Not an assertion about the number, an assertion that the number exists:
    // this is the figure the roadmap is argued from.
    expect(s.unsurfaced.length).toBeGreaterThan(0);
  });

  it('groups into the same domains the panel tab strip uses', () => {
    const d = byDomain();
    for (const k of ['visible', 'core', 'watch']) expect(d[k]?.length).toBeGreaterThan(0);
  });
});
