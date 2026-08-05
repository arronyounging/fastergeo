import type { BootstrapResult } from './bootstrap.js';

/**
 * Did the crawl actually learn what this company does?
 *
 * Written after a run against semrush.com. Every stage reported success. The
 * audit scored the homepage 87.6/100. The dossier came back with industry
 * "unknown", zero competitors, one confirmed fact — "visiting the site performs
 * a reCAPTCHA browser check" — and five E-grade placeholders where the
 * business, the founding, the entity and the customers should have been. From
 * that, four buyer questions were mined, all of them about the CAPTCHA; six
 * engines were sampled on those questions; and the metrics came back at a
 * perfect 1.0 mention rate because the brand name was in every question and
 * there were no competitors to share voice with.
 *
 * The system already knew. It graded its own ignorance E, five times, and then
 * nobody read the grade. That is the defect this closes: not a missing signal,
 * an unused one.
 *
 * The gate is deliberately blunt. Downstream work only makes sense if we can
 * say what the company sells; if we cannot, the honest output is one sentence
 * saying so, not a report with real-looking numbers in it.
 */

export interface Usability {
  usable: boolean;
  /** Plain reason, for the user, not a code. */
  reason?: string;
  /** What would fix it — always actionable, never "try again". */
  fix?: string;
}

/** Wording that belongs to an interception or error page, not to a business. */
const INTERSTITIAL =
  /(checking your browser|just a moment|verify you are (a )?human|recaptcha|hcaptcha|access denied|enable javascript|unusual traffic|人机验证|安全检查|浏览器检查|访问验证|验证页)/i;

const UNKNOWN = /^(unknown|n\/a|none|未知|不详|无)$/i;

export function assessDossier(
  d: Pick<BootstrapResult, 'brand' | 'facts' | 'competitorCandidates'> | null | undefined,
  lang: 'zh' | 'en' = 'en',
): Usability {
  const zh = lang === 'zh';
  if (!d?.brand) {
    return {
      usable: false,
      reason: zh ? '没能从这个网址读出任何东西。' : 'Nothing could be read from this URL.',
      fix: zh ? '确认网址能公开访问，然后重跑。' : 'Check the URL is publicly reachable, then run again.',
    };
  }
  const b = d.brand;
  const desc = String(b.description ?? '');

  // A description of the doorway rather than the building. This is the loudest
  // signal and it is worth its own message, because the fix is different.
  if (INTERSTITIAL.test(desc)) {
    return {
      usable: false,
      reason: zh
        ? `我读到的是一道访问门槛，不是你的业务 —— 档案写成了「${desc.slice(0, 40)}…」。`
        : `What came back describes an access barrier, not a business — the dossier reads "${desc.slice(0, 60)}…".`,
      fix: zh
        ? '把 AI 爬虫放行，或换一个被允许的网络重跑。在那之前往下算出来的每个数字都会在描述那道门槛。'
        : 'Allow AI crawlers through, or run from an allowed network. Until then every number derived from here would describe the barrier.',
    };
  }

  // The grading system already answered this. Facts we could not confirm are
  // graded E, and a dossier with nothing above E knows nothing worth using.
  const facts = d.facts?.facts ?? [];
  const solid = facts.filter(f => f.grade !== 'E' && f.status !== 'unconfirmed');
  const industryKnown = Boolean(b.industry) && !UNKNOWN.test(String(b.industry).trim());
  const hasCompetitors = (d.competitorCandidates ?? []).length > 0;

  if (!industryKnown && !hasCompetitors && solid.length <= 1) {
    return {
      usable: false,
      reason: zh
        ? `我没能弄明白这家公司卖什么 —— 行业未知、一个竞品都没认出来、${facts.length} 条事实里只有 ${solid.length} 条站得住。`
        : `I could not work out what this company sells — industry unknown, no competitor recognised, and only ${solid.length} of ${facts.length} facts stand up.`,
      fix: zh
        ? '通常是首页内容对爬虫不可见，或者读到的不是首页。先看一眼「爬虫读到了什么」，再决定要不要重跑。'
        : 'Usually the homepage is invisible to crawlers, or what came back was not the homepage. Look at what the crawler actually read before re-running.',
    };
  }
  return { usable: true };
}
