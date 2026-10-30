/**
 * The weekly re-ask: has the AI changed its mind about you?
 *
 * The daily loop measures whether AI *can* read a site. What a brand actually
 * pays to learn is whether AI *says* something different about them now — the
 * engine that called them a car-parts maker last month describing them
 * correctly today. That is the most persuasive line this product can write,
 * and also the easiest to get wrong, because one sample from a sampling model
 * flips on its own.
 *
 * So the same discipline as trends, in miniature:
 *   · the same question as last time (same brand string, same language)
 *   · a change is only reported when two more asks, right away, agree with
 *     it — three in a row. Measured 2026-10-30 on custyle.ai (en): the same
 *     question answered unknown, confused ("a Chinese consumer electronics
 *     company"), unknown. A one-in-three flip confirmed by a single repeat
 *     would mail a false "AI has you mixed up" about every nine weeks; three
 *     in a row is about twice a year, and the letter says "asked three times".
 *   · "unverified" is not a position; it never counts as a change either way
 *   · an outage is ours and says nothing about the brand
 *
 * Off unless SWEEP_PROBE=1: it spends model money on every watched site each
 * week, and whether to spend it is the owner's call, not the loop's.
 */
import { fetchPage } from '@fastergeo/audit';
import { probe } from './_probe.js';

const WEEK = 7 * 86400e3;
const FIRM = new Set(['knows', 'confused', 'unknown']);

/**
 * @param p   a project, or a scan seen as one (needs url, lang, probe)
 * @param ask injectable for tests; defaults to the live probe
 * @returns {{asked: boolean, reason?: string, line?: {en: string, zh: string}, kind?: 'fixed'|'broke'}}
 */
export async function reprobe(p, env, { ask = probe, fetch = fetchPage, now = Date.now() } = {}) {
  if (env?.SWEEP_PROBE !== '1' || !env?.OPENROUTER_API_KEY) return { asked: false, reason: 'off' };
  const last = p.probe;
  if (!last || !FIRM.has(last.verdict)) return { asked: false, reason: 'no firm baseline' };
  if (p.probeCheckedAt && now - Date.parse(p.probeCheckedAt) < WEEK) return { asked: false, reason: 'asked this week' };

  const host = new URL(p.url).hostname;
  const features = await fetch(p.url, 15000).catch(() => null);
  // Without the site's own words the judge has nothing to compare against, and
  // a site that was down this morning would read as "AI no longer knows you".
  if (!features) return { asked: false, reason: 'site unreachable' };
  const once = () => ask({ hostname: host, features, lang: p.lang, env, brand: last.brand });
  const a = await once().catch(() => null);
  // Tried, so the week is spent either way: retrying an outage daily would
  // spend more on our failure than on the user's answer.
  p.probeCheckedAt = new Date(now).toISOString();
  if (!a || a.error) return { asked: true, reason: 'outage' };
  if (!FIRM.has(a.verdict) || a.verdict === last.verdict) return { asked: true, reason: 'no change' };

  for (let i = 0; i < 2; i++) {
    const b = await once().catch(() => null);
    if (!b || b.error || b.verdict !== a.verdict) return { asked: true, reason: 'did not hold on repeat asks' };
  }

  p.probe = { ...a, timing: undefined };
  p.probeHistory = [...(p.probeHistory ?? []), { at: p.probeCheckedAt, from: last.verdict, to: a.verdict }].slice(-12);

  const brand = last.brand;
  const said = s => String(s).replace(/\s+/g, ' ').trim().slice(0, 160);
  if (a.verdict === 'knows') {
    return { asked: true, kind: 'fixed', line: {
      en: `AI changed its mind: asked "${a.question}", it now describes ${brand} correctly — "${said(a.answer)}…" (one engine, same verdict three times).`,
      zh: `AI 改口了：问「${a.question}」，它现在说对了 ${brand} ——「${said(a.answer)}…」（一个引擎，连问三次判定一致）。` } };
  }
  if (a.verdict === 'confused') {
    return { asked: true, kind: 'broke', line: {
      en: `AI now has ${brand} mixed up: "${said(a.evidence)}" (one engine, same verdict three times).`,
      zh: `AI 现在把 ${brand} 认错了：「${said(a.evidence)}」（一个引擎，连问三次判定一致）。` } };
  }
  // knows/confused → unknown: it forgot you. Worth a line on the page, and a
  // letter only when it had known you; losing a wrong answer is not bad news.
  return { asked: true, kind: last.verdict === 'knows' ? 'broke' : null, line: {
    en: last.verdict === 'knows' ? `AI no longer recognises ${brand} (one engine, same verdict three times).` : `AI stopped confusing ${brand} with someone else — it now says it does not know you (one engine, same verdict three times).`,
    zh: last.verdict === 'knows' ? `AI 不再认识 ${brand} 了（一个引擎，连问三次判定一致）。` : `AI 不再把 ${brand} 认成别人了 —— 它现在说不知道你（一个引擎，连问三次判定一致）。` } };
}
