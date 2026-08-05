import { describe, it, expect } from 'vitest';
import { assessDossier } from '../src/usable.js';

const d = (over: any = {}) => ({
  brand: { name: 'X', description: 'A tool that does a thing for teams.', industry: 'SaaS', ...over.brand },
  facts: { brand: 'X', definition: '', facts: over.facts ?? [
    { id: 'F1', claim: 'Founded 2019', grade: 'A', status: 'confirmed' },
    { id: 'F2', claim: 'Sells SEO tooling', grade: 'B', status: 'confirmed' },
  ] },
  competitorCandidates: over.competitors ?? [{ name: 'Ahrefs', confidence: 'high' }],
  questions: [],
} as any);

describe('assessDossier', () => {
  it('rejects the semrush run that caused this file to exist', () => {
    // Real output: one confirmed fact, about the CAPTCHA, and five E grades.
    const r = assessDossier(d({
      brand: { industry: '未知', description: '访问该网站前需进行reCAPTCHA浏览器安全检查，未展示具体业务。' },
      competitors: [],
      facts: [
        { id: 'F1', claim: '访问前会进行 reCAPTCHA 浏览器检查', grade: 'A', status: 'confirmed' },
        { id: 'F2', claim: '成立时间', grade: 'E', status: 'unconfirmed' },
        { id: 'F3', claim: '具体业务或服务内容', grade: 'E', status: 'unconfirmed' },
      ],
    }), 'zh');
    expect(r.usable).toBe(false);
    expect(r.reason).toMatch(/访问门槛/);
    expect(r.fix).toBeTruthy();
  });

  it('rejects a dossier that learned nothing, even without interstitial wording', () => {
    // The grading system already said so: nothing above E, no industry, no
    // competitor. Reading that grade is the whole point.
    const r = assessDossier(d({
      brand: { industry: 'unknown', description: 'A website.' },
      competitors: [],
      facts: [{ id: 'F1', claim: 'has a homepage', grade: 'E', status: 'unconfirmed' }],
    }));
    expect(r.usable).toBe(false);
    expect(r.reason).toMatch(/could not work out what this company sells/);
  });

  it('accepts an ordinary dossier', () => {
    expect(assessDossier(d()).usable).toBe(true);
  });

  it('accepts a thin dossier that still knows the industry', () => {
    // Refusing here would block real customers whose sites are simply small.
    expect(assessDossier(d({ competitors: [], facts: [
      { id: 'F1', claim: 'Sells handmade candles', grade: 'B', status: 'confirmed' },
    ] })).usable).toBe(true);
  });

  it('refuses an empty dossier rather than assuming', () => {
    expect(assessDossier(null).usable).toBe(false);
  });
});
