import type { PageFeatures } from './types.js';

/**
 * Did we actually read the site, or did a bot wall read us?
 *
 * This exists because of one run. Pointed at semrush.com, every stage of the
 * pipeline reported success: the crawler fetched a page, the audit scored it
 * 87.6/100 with zero blockers, the dossier summarised the business, a question
 * bank was mined, six engines were sampled, and the metrics came back at a
 * perfect 1.0 mention rate. All of it was derived from a Cloudflare
 * "Checking your browser" interstitial.
 *
 * Nothing in the output said so, and nothing could have: every existing check
 * passes on a challenge page. The HTML is well-formed, the word count is
 * healthy, there is no noindex, and the shell heuristic needs an *empty* page —
 * a wall is not empty, it is full of text about being a wall.
 *
 * That failure is worse than a crash. A crash tells you to try again; a
 * confident report about nothing gets acted on. So this is deliberately a
 * whole-run verdict rather than one more page blocker: if the entry page is a
 * wall, every number downstream is meaningless and must be refused, not
 * annotated.
 *
 * The detection is signature-based on purpose. Inferring "this looks like a
 * challenge" from structure would fire on real pages — a short landing page
 * with one form is indistinguishable in shape — and a false positive here tells
 * a paying customer their site is unreadable when it is fine.
 */

export type WallVendor =
  | 'cloudflare' | 'recaptcha' | 'hcaptcha' | 'datadome'
  | 'perimeterx' | 'akamai' | 'imperva' | 'generic';

export interface BotWall {
  vendor: WallVendor;
  /** The matched phrase, verbatim, so a human can check the call. */
  evidence: string;
}

/** Phrases that only appear on an interception page, never on real content. */
const SIGNATURES: Array<[WallVendor, RegExp]> = [
  ['cloudflare', /checking your browser before accessing/i],
  ['cloudflare', /cf[-_]browser[-_]verification|__cf_chl_|cf_chl_opt/i],
  ['cloudflare', /attention required!?\s*\|\s*cloudflare/i],
  ['cloudflare', /enable javascript and cookies to continue/i],
  ['cloudflare', /just a moment\.\.\./i],
  ['recaptcha', /recaptcha/i],
  ['hcaptcha', /hcaptcha/i],
  ['datadome', /datadome|dd_?cookie|geo\.captcha-delivery\.com/i],
  ['perimeterx', /perimeterx|_px[cC]aptcha|human\s*challenge/i],
  ['akamai', /akamai.*(bot manager|reference\s*#)|_abck/i],
  ['imperva', /incapsula incident id|imperva/i],
  ['generic', /please verify you are a human|verify you are human/i],
  ['generic', /access denied.*(bot|automated|unusual traffic)/i],
  ['generic', /unusual traffic from your (computer )?network/i],
];

/** HTTP statuses an interception page is typically served with. */
const WALL_STATUS = new Set([401, 403, 405, 429, 503]);

/**
 * @param f the parsed page.
 * @param html the raw HTML — signatures often live in script config, not text.
 *
 * Returns null when the page reads as genuine. A hit needs either a vendor
 * signature, or a wall-shaped status paired with challenge wording, so that a
 * page merely mentioning "recaptcha" in prose (a docs page about CAPTCHAs, a
 * security blog) does not get flagged on wording alone.
 */
export function detectBotWall(f: PageFeatures, html = ''): BotWall | null {
  const hay = `${f.title}\n${f.text.slice(0, 4000)}\n${html.slice(0, 20_000)}`;
  for (const [vendor, re] of SIGNATURES) {
    const m = re.exec(hay);
    if (!m) continue;
    // A real page can discuss CAPTCHAs at length. What it does not do is
    // discuss them *instead of* having content, so the weakest signatures are
    // only trusted on a thin page or a wall-shaped status.
    const weak = vendor === 'recaptcha' || vendor === 'hcaptcha';
    if (weak && !(WALL_STATUS.has(f.status) || f.wordCount < 400)) continue;
    return { vendor, evidence: m[0].slice(0, 120) };
  }
  // A wall-shaped status with almost nothing on the page is a wall even when
  // the vendor left no fingerprint.
  if (WALL_STATUS.has(f.status) && f.wordCount < 200) {
    return { vendor: 'generic', evidence: `HTTP ${f.status} with ${f.wordCount} words` };
  }
  return null;
}

export function wallBlocker(w: BotWall): string {
  return `bot-wall(${w.vendor}): this is an interception page, not your site — `
    + `everything measured from here describes the wall. Evidence: "${w.evidence}"`;
}
