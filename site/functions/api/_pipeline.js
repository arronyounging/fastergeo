/**
 * A project, built one stage at a time.
 *
 * Okara's terminal is not decoration — it exists because the work takes minutes,
 * and watching it happen is what makes an empty dashboard feel like someone
 * started working for you. The same constraint applies here for a harder reason:
 * a Worker cannot sit on a request for two minutes, so the pipeline is split
 * into stages the client advances one at a time. Each stage returns the lines it
 * would have printed, which gives us the terminal for free rather than as a
 * separate feature to fake.
 *
 * Every stage is independently retryable and writes its own result, so a failed
 * dossier does not cost you the audit that already succeeded.
 */
import { auditPage, checkSite, fetchPage } from '@fastergeo/audit';
import { generateTickets, diagnose, stationForTicket, playbookFor, stationOf, mergeFeed, feedCounts } from '@fastergeo/tickets';
import { bootstrapProject, assessDossier } from '@fastergeo/content';
import { askLlm, parseJsonish } from './_llm.js';
import { buildVoice, buildContentStrategy } from './_docs.js';

export const STAGES = ['crawl', 'audit', 'dossier', 'docs', 'probe', 'tickets', 'done'];

const MAX_PAGES = 5;
const say = (p, en, zh) => p.log.push({ t: Date.now(), m: p.lang === 'zh' ? zh : en });

/* ── discovery ─────────────────────────────────────────────────────────── */

/**
 * Which pages to read. A homepage alone tells you almost nothing about what a
 * company sells or charges — the pages that carry that are the ones with these
 * words in the path, and they are also the pages buyers land on from an AI
 * answer. Sitemap first because it is the site's own account of itself.
 */
const WORTH_READING = /\/(about|product|pricing|plans|features|solutions?|services?|company|docs?)(\/|$)/i;

async function discover(root, home) {
  const out = [];
  const seen = new Set([root]);
  const add = u => {
    try {
      const abs = new URL(u, root);
      if (abs.origin !== new URL(root).origin) return;
      abs.hash = '';
      const s = abs.href;
      if (!seen.has(s) && out.length < MAX_PAGES - 1) { seen.add(s); out.push(s); }
    } catch { /* skip unparseable */ }
  };
  try {
    const res = await fetch(new URL('/sitemap.xml', root).href, { cf: { cacheTtl: 300 } });
    if (res.ok) {
      const xml = (await res.text()).slice(0, 200000);
      const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => m[1]);
      for (const u of locs.filter(u => WORTH_READING.test(u))) add(u);
    }
  } catch { /* sitemap optional */ }
  for (const u of (home?.internalLinks ?? []).filter(u => WORTH_READING.test(u))) add(u);
  return out;
}

/* ── stages ────────────────────────────────────────────────────────────── */

const STAGE_FNS = {
  async crawl(p, env) {
    say(p, `Reading ${p.url}`, `我在读 ${p.url}`);
    const home = await fetchPage(p.url, 15000);
    if (!home) throw new Error('could not fetch the site');
    const more = await discover(p.url, home);
    say(p, `Found ${more.length + 1} pages worth reading.`, `找到 ${more.length + 1} 个值得读的页面。`);
    const rest = (await Promise.all(more.map(u => fetchPage(u, 12000).catch(() => null)))).filter(Boolean);
    const all = [home, ...rest].filter(x => x.status === 200);
    const thin = (more.length + 1) - all.length;
    if (thin > 0) say(p, `${thin} unreachable — working with the rest.`, `${thin} 页打不开，用剩下的。`);
    // Trimmed: the record is stored, and full page text would bloat every read
    // of it for no gain — the dossier prompt does not use more than this.
    p.pages = all.map(x => ({ url: x.url, title: x.title, text: String(x.text ?? '').slice(0, 4000) }));
    p.homeTitle = home.title;
    p.homeMeta = home.metaDescription;
    return 'audit';
  },

  async audit(p, env) {
    say(p, `Looking at your site the way an AI crawler does.`, `我在用 AI 爬虫的眼睛看你的网站。`);
    const urls = p.pages.map(x => x.url);
    const [pages, site] = await Promise.all([
      Promise.all(urls.map(u => auditPage(u, { timeoutMs: 15000 }).catch(() => null))),
      checkSite(p.url, 10000).catch(() => null),
    ]);
    const ok = pages.filter(Boolean);
    const avg = ok.length ? ok.reduce((s, x) => s + x.score, 0) / ok.length : null;
    const grade = avg === null ? 'D' : avg >= 85 ? 'A' : avg >= 70 ? 'B' : avg >= 50 ? 'C' : 'D';
    p.audit = {
      root: p.url, generatedAt: new Date().toISOString(),
      site: site ?? { robotsTxtFound: false, blockedAiCrawlers: [], sitemapFound: false, llmsTxtFound: false },
      entity: ok[0]?.entity, pages: ok,
      avgScore: avg === null ? null : Math.round(avg * 10) / 10,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, [grade]: ok.length }, blockers: [],
    };
    // A bot wall ends the run. It cannot be a warning: a challenge page is
    // well-formed HTML with plenty of text, so it scores well, and every stage
    // after this one would derive real-looking numbers from it — a dossier of
    // the wall, a question bank about the wall, engine answers about the wall.
    // Refusing is the only honest option; annotating would ship the report.
    const walled = ok.filter(x => x.wall);
    if (walled.length && walled.length >= Math.max(1, ok.length / 2)) {
      const w = walled[0].wall;
      p.audit.readable = false;
      p.audit.blockers = [
        `bot-wall-site: ${walled.length}/${ok.length} pages returned an interception page (${w.vendor}).`,
      ];
      p.wall = { vendor: w.vendor, evidence: w.evidence, pages: walled.length, of: ok.length };
      say(p,
        `Stopping here. ${p.url} answered with a ${w.vendor} bot check, not your site — "${w.evidence}".`,
        `我停在这里。${p.url} 返回的是 ${w.vendor} 的机器人验证页，不是你的网站 —— 「${w.evidence}」。`);
      say(p,
        `I could score that page and keep going, and every number after it would describe the wall. That is worse than stopping.`,
        `我可以照样给这一页打分接着跑，后面每一个数字都会在描述这堵墙。那比停下来更糟。`);
      say(p,
        `Allow AI crawlers through, or run this from an allowed network, then start again.`,
        `把 AI 爬虫放行，或者换一个被允许的网络重跑一次。`);
      return 'done';
    }
    p.audit.readable = true;
    const thinnest = [...ok].sort((a, b) => a.wordCount - b.wordCount)[0];
    if (thinnest) {
      say(p, `Thinnest page an AI sees: ${thinnest.wordCount} words.`,
        `AI 看到内容最少的一页：${thinnest.wordCount} 个词。`);
    }
    const blocked = p.audit.site.blockedSearchCrawlers ?? [];
    if (blocked.length) {
      say(p, `robots.txt blocks ${blocked.length} AI search crawler(s).`,
        `robots.txt 挡掉了 ${blocked.length} 个 AI 搜索爬虫。`);
    }
    say(p, `Site AI-readiness: ${p.audit.avgScore ?? '—'} / 100.`, `网站 AI 就绪度：${p.audit.avgScore ?? '—'} / 100。`);
    return 'dossier';
  },

  async dossier(p, env) {
    if (!env.OPENROUTER_API_KEY) {
      say(p, `No engine configured — skipping the dossier.`, `没有配置引擎 —— 跳过档案。`);
      return 'tickets';
    }
    say(p, `Working out what you do, who you compete with, and what buyers ask.`,
      `我在弄明白你是做什么的、跟谁竞争、买家会问什么。`);
    const r = await bootstrapProject(p.url, p.pages,
      prompt => askLlm(env, prompt, { maxTokens: 4000 }));
    const confirmed = r.facts.facts.filter(f => f.status === 'confirmed').length;
    const unconfirmed = r.facts.facts.length - confirmed;
    p.dossier = r;
    say(p, `Got it. ${r.brand.name} — ${r.brand.description}`, `明白了。${r.brand.name} —— ${r.brand.description}`);
    say(p, `${confirmed} brand facts, each with a source.`
      + (unconfirmed ? ` ${unconfirmed} left unconfirmed rather than guessed.` : ''),
    `建好 ${confirmed} 条品牌事实，每条都有来源。`
      + (unconfirmed ? ` 另有 ${unconfirmed} 条推导不出，标了待确认，没有瞎猜。` : ''));
    const names = r.competitorCandidates.map(c => c.name);
    if (names.length) {
      say(p, `Competitors to review: ${names.join(', ')}`, `待你核对的竞品：${names.join('、')}`);
    }
    say(p, `Question bank: ${r.questions.length} buying questions.`, `问题库：${r.questions.length} 个购买意图问题。`);
    // The grading system already knows when the crawl learned nothing: it marks
    // unconfirmed facts E. Reading that grade is the whole point — a run against
    // semrush.com once produced a dossier of a CAPTCHA page, four buyer questions
    // about the CAPTCHA, six engines sampled on them, and a perfect 1.0 mention
    // rate, with every stage reporting success.
    const use = assessDossier(p.dossier, p.lang);
    if (!use.usable) {
      p.unusable = use;
      say(p, use.reason, use.reason);
      say(p,
        `I am stopping rather than building a question bank, sampling engines and scoring pages on top of that — the numbers would look real and mean nothing.`,
        `我停在这里，不去在这个基础上继续建题库、采样引擎、给页面打分 —— 那些数字会看着很像真的，但什么都不是。`);
      say(p, use.fix, use.fix);
      return 'done';
    }
    return 'docs';
  },

  async docs(p, env) {
    // Voice is extracted, never written: quoting what the brand already
    // published and letting a human name the pattern is the only honest way to
    // do this, and it is the same refusal the CLI makes.
    p.voice = buildVoice(p.pages, p.lang);
    say(p, `Pulled ${p.voice.evidence.length} sentences you already wrote — the voice guide is yours to name.`,
      `摘了 ${p.voice.evidence.length} 句你自己写过的话 —— 语气怎么定，你说了算。`);

    const strat = await buildContentStrategy(env, {
      brand: p.dossier?.brand, questions: p.dossier?.questions, audit: p.audit,
      competitors: p.dossier?.competitorCandidates, lang: p.lang,
    });
    if (strat) {
      p.strategy = strat;
      say(p, `Content plan: ${strat.pieces.length} pieces, each answering a question buyers actually ask.`,
        `内容计划：${strat.pieces.length} 篇，每篇都对着一个买家真会问的问题。`);
    } else {
      say(p, `Not enough to plan content from yet.`, `还不够推导内容计划。`);
    }
    return 'probe';
  },

  async probe(p, env) {
    if (!env.OPENROUTER_API_KEY) return 'tickets';
    const brand = p.dossier?.brand?.name ?? new URL(p.url).hostname;
    const zh = p.lang === 'zh';
    const question = zh ? `${brand} 是一家什么公司？` : `What kind of company is ${brand}?`;
    say(p, `Asking an engine: "${question}"`, `我去问引擎：「${question}」`);
    const answer = await askLlm(env, question, { maxTokens: 1200 });
    const truth = [p.homeTitle, p.homeMeta, p.pages[0]?.text?.slice(0, 700)].filter(Boolean).join('\n');
    let verdict = 'unverified', evidence = '';
    try {
      const j = parseJsonish(await askLlm(env, judgePrompt(question, answer, truth), { maxTokens: 800 }));
      if (['knows', 'confused', 'unknown'].includes(j?.verdict)) {
        verdict = j.verdict;
        if (verdict === 'confused') {
          // The claim that costs most if wrong is the one we will not make
          // without proof a reader can check against the answer itself.
          if (quoteFound(answer, j.quote)) evidence = String(j.quote);
          else verdict = 'unverified';
        }
      }
    } catch { /* the answer stands on its own */ }
    p.probe = { brand, question, answer, engine: 'deepseek', market: 'cn', verdict, evidence };
    const said = { knows: [`It knows who you are.`, `它知道你是谁。`],
      unknown: [`It does not know who you are.`, `它不知道你是谁。`],
      confused: [`It has you mixed up with a different company.`, `它把你认成了别的公司。`],
      unverified: [`Read the answer yourself — we would not call this one.`, `这条我们不替你下结论，你自己看。`] }[verdict];
    say(p, said[0], said[1]);
    return 'tickets';
  },

  async tickets(p, env) {
    say(p, `Turning all of that into a fix list.`, `我在把这些变成一张修复清单。`);
    const fresh = generateTickets(p.audit, undefined, p.lang).map(t => ({
      ...t, station: stationForTicket(t), playbook: playbookFor(t),
    }));
    // Merged, never replaced: what the user has already seen, snoozed or
    // finished is the only state they create here, and a queue that resets
    // every run teaches them nothing they do is recorded.
    const merged = mergeFeed(p.feed ?? [], fresh);
    p.feed = merged.items;
    p.feedCounts = feedCounts(p.feed);
    p.tickets = fresh;
    // The funnel is the product's spine: a flat list of eight tickets is a
    // to-do list, and a to-do list is not a methodology. This says where the
    // break is, so work downstream of it can wait.
    p.diagnosis = diagnose({ audit: p.audit, probe: p.probe, tickets: p.tickets });
    const p0 = p.tickets.filter(t => t.priority === 'P0').length;
    say(p, `${p.tickets.length} items${p0 ? `, ${p0} of them P0` : ''} — each says what "done" has to look like.`,
      `${p.tickets.length} 条${p0 ? `，其中 ${p0} 条 P0` : ''} —— 每条都写明了「修到什么程度算好」。`);
    const d = p.diagnosis;
    if (d?.breakAt) {
      const s = stationOf(d.breakAt);
      say(p, `You break at station ${s.n}: ${s.q.en} Everything downstream of it waits.`,
        `你断在第 ${s.n} 站：${s.q.zh}它后面的活先等着。`);
    }
    say(p, `Done. Everything above is on this page now.`, `跑完了。上面这些现在都在这一页上。`);
    return 'done';
  },
};

function judgePrompt(question, answer, truth) {
  return `An AI was asked "${question}" and answered:

"""
${answer.slice(0, 1500)}
"""

Here is what the company's own website says:

"""
${truth}
"""

Classify the answer. Be strict, and note that these three get fixed in completely different ways — a wrong verdict sends someone to fix the wrong thing:

- "knows": it is describing THIS company. Individual details may be wrong — a
  founding year, a headquarters, a funding number — and it is still "knows".
  Getting a fact wrong about the right company is not mistaken identity.
- "confused": the answer is about a DIFFERENT company. It names another parent
  company, another industry, or another product line as the core of what this
  company does. The identity itself is wrong, not a detail of it.
- "unknown": it cannot find the company, says no well-known company matches, or
  only restates the category with no specifics ("appears to be a data analytics
  company; companies in this space typically…"). Vague agreement is not
  knowledge — if you learned nothing about THIS company, it is unknown.

One more test, for answers that hedge and then guess. If the answer offers the
reader a CHOICE ("it might be A, or it might be B — where did you see it?"), or
invites them to supply more context, it has not identified anyone: that is
"unknown", however confidently each option is phrased. It is "confused" only
when the answer settles on ONE identity and leaves the reader believing it.

Ask yourself: would a reader come away believing this is a different company?
Only then is it confused. If they would come away knowing the right company
with one wrong fact, it is knows. If they would come away knowing nothing
specific, it is unknown.

Reply with JSON only: {"verdict":"knows|confused|unknown","quote":"<the exact sentence that asserts the wrong identity — required for confused, empty otherwise>"}`;
}

/** Compared as a reader sees it: markdown punctuation is not part of the claim. */
function quoteFound(answer, quote) {
  if (!quote || quote.length < 8) return false;
  const flat = s => String(s).replace(/[*_`#~]/g, '').replace(/\s+/g, '').toLowerCase();
  const q = flat(quote);
  return q.length >= 6 && flat(answer).includes(q.slice(0, 60));
}

/**
 * Runs one stage. Failures are recorded on the project and the pipeline moves
 * on rather than stalling: a dossier that could not be derived should not cost
 * the user the audit and the tickets that would have worked.
 */
export async function runStage(p, env) {
  const fn = STAGE_FNS[p.stage];
  if (!fn) return { done: true };
  const before = p.log.length;
  try {
    p.stage = await fn(p, env);
  } catch (err) {
    const msg = String(err?.message ?? err);
    say(p, `Could not finish this step (${msg}) — carrying on with what worked.`,
      `这一步没跑完（${msg}）—— 用已经成功的部分继续。`);
    p.errors = [...(p.errors ?? []), { stage: p.stage, msg }];
    const i = STAGES.indexOf(p.stage);
    p.stage = STAGES[Math.min(i + 1, STAGES.length - 1)];
  }
  return { done: p.stage === 'done', newLines: p.log.slice(before) };
}
