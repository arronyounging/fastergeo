/**
 * The daily loop: check often, act rarely.
 *
 * The obvious build is "re-run everything each morning and show the user what
 * came back". That is a nuisance machine: it re-alerts the same finding, it
 * nags about a fix that is still in progress, and it trains people to ignore it
 * within a week.
 *
 * So this separates two things that are easy to conflate:
 *   check cadence — how often we LOOK  (daily)
 *   acts when     — what makes it worth SAYING something (a real change,
 *                   outside a cooldown, not already reported)
 *
 * Most runs should end with "nothing to report" and write nothing but a
 * last-checked marker. That is the loop working, not the loop failing.
 */
import { auditPage, checkSite } from '@fastergeo/audit';
import { generateTickets } from '@fastergeo/tickets';

const DAY = 86400e3;
/** How long a given kind of finding stays quiet after being reported once. */
const COOLDOWN = {
  score: 3 * DAY,      // scores wobble; do not narrate every point
  blocker: 7 * DAY,    // serious, but repeating it daily helps nobody
  fixed: 0,            // a fix landing is always worth saying, immediately
  crawler: 7 * DAY,
};
/** Score noise floor. Below this, a change is measurement wobble, not news. */
const SCORE_EPSILON = 3;

const say = (lines, lang, en, zh) => lines.push({ t: Date.now(), m: lang === 'zh' ? zh : en, loop: true });

/**
 * @param p the stored project. Mutated in place: callers persist it.
 * @returns {{acted: boolean, reasons: string[]}} acted=false is the good case.
 */
export async function runDailyCheck(p, env) {
  const now = Date.now();
  const lang = p.lang;
  const state = p.loop ?? (p.loop = { lastCheck: null, reported: {} });
  const lines = [];
  const reasons = [];

  // Idempotency: a finding is keyed so the same one cannot be reported twice
  // inside its cooldown, no matter how many times the loop runs.
  const quiet = key => {
    const at = state.reported[key];
    const kind = key.split(':')[0];
    return at && (now - at) < (COOLDOWN[kind] ?? 3 * DAY);
  };
  const mark = key => { state.reported[key] = now; };

  const before = p.audit;
  if (!before) return { acted: false, reasons: ['never audited'] };

  const urls = (before.pages ?? []).map(x => x.url).slice(0, 5);
  const [pages, site] = await Promise.all([
    Promise.all(urls.map(u => auditPage(u, { timeoutMs: 15000 }).catch(() => null))),
    checkSite(p.url, 10000).catch(() => null),
  ]);
  const ok = pages.filter(Boolean);
  if (!ok.length) {
    // Not silent: a site we cannot reach at all is itself worth one line, but
    // only once per cooldown so an outage does not become a daily drumbeat.
    if (!quiet('blocker:unreachable')) {
      say(lines, lang, `I could not reach ${p.url} today.`, `今天没能访问 ${p.url}。`);
      mark('blocker:unreachable');
      state.lastCheck = now;
      p.log.push(...lines);
      return { acted: true, reasons: ['unreachable'] };
    }
    state.lastCheck = now;
    return { acted: false, reasons: ['unreachable, already reported'] };
  }

  const avg = Math.round((ok.reduce((s, x) => s + x.score, 0) / ok.length) * 10) / 10;
  const after = {
    ...before, generatedAt: new Date().toISOString(),
    site: site ?? before.site, pages: ok, avgScore: avg,
  };

  /* ── what changed, and is any of it worth saying ─────────────────────── */

  // 1. A fix landing. Always reported, no cooldown — this is the moment the
  //    whole product exists for, and it is the one line a user came back for.
  const wasBlocked = new Set((before.pages ?? [])
    .filter(x => (x.blockers ?? []).length).map(x => x.url));
  const nowClean = ok.filter(x => wasBlocked.has(x.url) && !(x.blockers ?? []).length);
  for (const pg of nowClean) {
    say(lines, lang,
      `Fixed: ${pg.url} now renders for AI crawlers — ${pg.wordCount} words where there were none.`,
      `修好了：${pg.url} 现在对 AI 爬虫可见了 —— 从读不到变成 ${pg.wordCount} 个词。`);
    reasons.push('blocker cleared');
  }
  if (!before.site?.llmsTxtFound && after.site?.llmsTxtFound) {
    say(lines, lang, `Fixed: llms.txt is live.`, `修好了：llms.txt 上线了。`);
    reasons.push('llms.txt added');
  }

  // 2. Score movement, but only past the noise floor and outside cooldown.
  const delta = before.avgScore === null ? null : avg - before.avgScore;
  if (delta !== null && Math.abs(delta) >= SCORE_EPSILON && !quiet('score:avg')) {
    const up = delta > 0;
    say(lines, lang,
      `Site AI-readiness ${up ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} to ${avg}. One period is an observation, not a trend.`,
      `网站 AI 就绪度${up ? '涨' : '跌'}了 ${Math.abs(delta).toFixed(1)}，现在 ${avg}。单期只算观察，不算趋势。`);
    mark('score:avg');
    reasons.push('score moved');
  }

  // 3. New breakage. Worth interrupting a morning for.
  const hadBlocker = new Set((before.pages ?? []).flatMap(x => (x.blockers ?? []).map(b => x.url + '|' + b)));
  for (const pg of ok) {
    for (const b of pg.blockers ?? []) {
      const key = `blocker:${pg.url}|${b}`;
      if (!hadBlocker.has(pg.url + '|' + b) && !quiet(key)) {
        say(lines, lang, `New problem on ${pg.url}: ${b}`, `${pg.url} 出了新问题：${b}`);
        mark(key);
        reasons.push('new blocker');
      }
    }
  }
  const newlyBlocked = (after.site?.blockedSearchCrawlers ?? [])
    .filter(c => !(before.site?.blockedSearchCrawlers ?? []).includes(c));
  if (newlyBlocked.length && !quiet('crawler:blocked')) {
    say(lines, lang,
      `robots.txt now blocks ${newlyBlocked.join(', ')} — that removes you from those AI answers.`,
      `robots.txt 现在挡住了 ${newlyBlocked.join('、')} —— 这会把你从那些 AI 答案里删掉。`);
    mark('crawler:blocked');
    reasons.push('crawler blocked');
  }

  /* ── persist ──────────────────────────────────────────────────────────── */

  p.audit = after;
  p.tickets = generateTickets(after, undefined, lang);
  state.lastCheck = now;

  if (!lines.length) {
    // The quiet path, and it is the common one. Recorded so the user can see
    // the loop is alive without being told anything they did not need to hear.
    state.quietRuns = (state.quietRuns ?? 0) + 1;
    return { acted: false, reasons: ['no change worth reporting'] };
  }
  state.quietRuns = 0;
  p.log.push(...lines);
  return { acted: true, reasons, lines };
}
