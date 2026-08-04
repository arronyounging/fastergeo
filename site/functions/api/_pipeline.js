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
import { generateTickets } from '@fastergeo/tickets';
import { bootstrapProject } from '@fastergeo/content';
import { askLlm, parseJsonish } from './_llm.js';

export const STAGES = ['crawl', 'audit', 'dossier', 'probe', 'tickets', 'done'];

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
    p.tickets = generateTickets(p.audit, undefined, p.lang);
    const p0 = p.tickets.filter(t => t.priority === 'P0').length;
    say(p, `${p.tickets.length} items${p0 ? `, ${p0} of them P0` : ''} — each says what "done" has to look like.`,
      `${p.tickets.length} 条${p0 ? `，其中 ${p0} 条 P0` : ''} —— 每条都写明了「修到什么程度算好」。`);
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

Classify the answer. Be strict — these mean different things and get fixed differently:
- "knows": describes the same company the website describes.
- "confused": ASSERTS a specific different identity — names another parent company,
  industry or product line as if it were this one. A guess from the name alone is NOT confusion.
- "unknown": says it cannot find the company, or only speculates from what the name sounds like.

If the answer opens by saying no well-known company matches, it is "unknown" even if it then guesses.

Reply with JSON only: {"verdict":"knows|confused|unknown","quote":"<exact sentence asserting the wrong identity, empty otherwise>"}`;
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
