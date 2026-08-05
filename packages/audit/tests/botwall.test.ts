import { describe, it, expect } from 'vitest';
import { detectBotWall } from '../src/botwall.js';
import type { PageFeatures } from '../src/types.js';

const page = (over: Partial<PageFeatures> = {}): PageFeatures => ({
  url: 'https://x.com/', status: 200, htmlBytes: 20_000, title: 'X', metaDescription: '',
  canonical: null, noindex: false, lang: 'en', text: 'a real page about a real product',
  wordCount: 1200, h1: ['X'], h2: [], h3: [], paragraphCount: 8, pronounStartParagraphs: 0,
  listCount: 1, tableCount: 0, jsonLdTypes: [], hasPublishDate: true, modifiedDate: null,
  sameAsCount: 2, hasAuthor: true, externalLinkCount: 3, internalLinkCount: 12, internalLinks: [],
  ...over,
});

describe('detectBotWall', () => {
  it('catches the run that caused this file to exist', () => {
    // semrush.com served a Cloudflare interstitial. It scored 87.6/100 with no
    // blockers, and every derived number downstream described the wall.
    const w = detectBotWall(page({
      title: 'Just a moment...',
      text: 'Checking your browser before accessing semrush.com. This process is automatic.',
      wordCount: 1315,
    }));
    expect(w?.vendor).toBe('cloudflare');
    expect(w?.evidence).toMatch(/checking your browser/i);
  });

  it('does not flag a real page that merely writes about CAPTCHAs', () => {
    // A false positive tells a paying customer their site is unreadable when it
    // is fine, so the weak signatures need a thin page or a wall-shaped status.
    expect(detectBotWall(page({
      title: 'How reCAPTCHA affects conversion rates',
      text: 'reCAPTCHA adds friction at signup. In our tests hCaptcha performed similarly.',
      wordCount: 1800, status: 200,
    }))).toBeNull();
  });

  it('flags a captcha page when the page is thin', () => {
    expect(detectBotWall(page({ text: 'Please complete the reCAPTCHA', wordCount: 40 }))?.vendor)
      .toBe('recaptcha');
  });

  it('finds vendor fingerprints hiding in script config, not visible text', () => {
    const w = detectBotWall(page(), '<script>window.__cf_chl_opt={cvId:"3"}</script>');
    expect(w?.vendor).toBe('cloudflare');
  });

  it('calls a near-empty 403 a wall even with no vendor fingerprint', () => {
    expect(detectBotWall(page({ status: 403, wordCount: 12, text: 'Forbidden' }))?.vendor)
      .toBe('generic');
  });

  it('leaves an ordinary page alone', () => {
    expect(detectBotWall(page())).toBeNull();
  });

  it('does not call a healthy 200 page a wall just for being short', () => {
    expect(detectBotWall(page({ wordCount: 90, text: 'Short but genuine landing page.' }))).toBeNull();
  });
});
