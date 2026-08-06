/**
 * The growth engine: run a methodology against one company and hand back work.
 *
 * There are sixty-nine playbooks in this product and until now they were
 * something a user could *read*. That is a library, not an engine. What a buyer
 * pastes a URL for is the other thing — every methodology actually applied to
 * their company, and the result stacked so the first screen is a verdict and
 * the last is a task list.
 *
 * The whole difficulty is that a methodology applied without the data it needs
 * produces confident, generic, wrong advice — which is worse than no advice,
 * because it is indistinguishable from the real thing until someone acts on it.
 * So every run has to answer three questions in order, and the schema forces
 * that order:
 *
 *   applies  — is this methodology even relevant to this business?
 *   needs    — what would it take to do this properly, that we do not have?
 *   verdict  — and only then, what does it say?
 *
 * A run that skips to the verdict without naming what it lacks is exactly the
 * failure this product exists to measure in other tools.
 */

export type RunStatus =
  /** Ran with the data it needs. */
  | 'ran'
  /** Ran, but on partial data — the finding stands, the confidence does not. */
  | 'partial'
  /** Does not apply to this business, with a reason. */
  | 'n/a'
  /** Cannot run at all until something arrives. */
  | 'blocked';

export interface Finding {
  /** What is true, in the user's terms. */
  claim: string;
  /** Where it came from. Empty is not allowed for a 'ran' result. */
  evidence: string;
}

export interface Action {
  /** One thing to do. */
  do: string;
  /** How anyone can tell it is finished, without asking us. */
  doneWhen: string;
  /** P0 blocks everything downstream; P2 is worth doing when convenient. */
  priority: 'P0' | 'P1' | 'P2';
}

export interface SkillRun {
  skill: string;
  domain: string;
  status: RunStatus;
  /** One line. The thing a reader should take away if they read nothing else. */
  verdict: string;
  findings: Finding[];
  actions: Action[];
  /** Data we would need to do this properly. Named even on a good run. */
  needs: string[];
  /** Milliseconds, for the progress display — a 69-step run has to feel alive. */
  ms?: number;
  error?: string;
}

/** What the engine is allowed to know. Nothing else reaches the prompt. */
export interface Ground {
  url: string;
  brand?: { name?: string; description?: string; industry?: string; aliases?: string[] };
  facts?: Array<{ claim: string; grade: string; status?: string }>;
  competitors?: Array<{ name: string; why?: string }>;
  questions?: Array<{ text: string; market?: string; brandInQuestion?: boolean }>;
  /** Six-dimension audit summary and the problems it found. */
  audit?: { avgScore?: number | null; pages?: number; issues?: string[]; site?: Record<string, unknown> };
  /** What an engine actually said, verbatim. */
  probe?: { question?: string; verdict?: string; answer?: string; engine?: string };
  /** Which funnel station the diagnosis says is broken. */
  breakAt?: string | null;
  lang?: 'zh' | 'en';
}

/** A trimmed playbook: heading plus body, already bounded by the bundler. */
export interface Playbook {
  about?: string;
  sections: Array<{ h: string; b: string }>;
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

/**
 * Our audit's issue codes, said in words.
 *
 * `block-gap:comparison` is an internal identifier meaning "this page has no
 * comparison block". Passed through raw it reads like a CSS property, and on a
 * real run a methodology dutifully produced "check the block-gap property in
 * your stylesheet" — confident, actionable and about nothing. An internal code
 * in a prompt is an invitation to invent a meaning for it.
 */
const ISSUE: Record<string, string> = {
  'block-gap:definition': 'the page has no standalone definition block an AI could lift',
  'block-gap:comparison': 'the page has no comparison block (us vs the alternatives)',
  'block-gap:statistics': 'the page has no statistics block with sources',
  'block-gap:steps': 'the page has no step-by-step block',
  'block-gap:faq': 'the page has no FAQ block',
  'answer-below-fold': 'the answer to the page\'s own question sits below the first 30% of the text',
  'content-short': 'the page is too thin for an AI to extract anything from',
  'no-date': 'the page states no publish or updated date',
  'no-author': 'the page names no author',
  'no-external-links': 'the page cites no outside source',
  'few-h2': 'the page has almost no subheadings, so it cannot be chunked',
  'no-lists': 'the page has no lists, which is where extractable structure usually lives',
  'spa-shell': 'the page renders empty to a crawler — the content is drawn by JavaScript',
};

export function humanise(issue: string): string {
  const key = String(issue).trim();
  if (ISSUE[key]) return ISSUE[key];
  // Codes carry a colon and no spaces. Anything else is already prose.
  const base = key.split(':')[0];
  if (ISSUE[base]) return ISSUE[base];
  return key.includes(' ') ? key : key.replace(/[:_-]+/g, ' ');
}

/**
 * The context block. Deliberately small: a methodology reasons better from a
 * tight, honest brief than from everything we hold, and a long prompt makes the
 * model pad its answer to match.
 */
export function brief(g: Ground): string {
  const L: string[] = [];
  L.push(`COMPANY: ${g.brand?.name ?? g.url} — ${g.brand?.description ?? '(no description derived)'}`);
  if (g.brand?.industry) L.push(`INDUSTRY (derived, unconfirmed): ${g.brand.industry}`);
  const f = (g.facts ?? []).filter(x => x.grade !== 'E' && x.status !== 'unconfirmed').slice(0, 12);
  if (f.length) L.push('CONFIRMED FACTS:\n' + f.map(x => `- [${x.grade}] ${x.claim}`).join('\n'));
  const c = (g.competitors ?? []).slice(0, 10);
  if (c.length) L.push(`COMPETITORS (guessed from their own site, unconfirmed): ${c.map(x => x.name).join(', ')}`);
  const q = (g.questions ?? []).filter(x => !x.brandInQuestion).slice(0, 10);
  if (q.length) L.push('BUYER QUESTIONS WE MINED:\n' + q.map(x => `- ${x.text}`).join('\n'));
  if (g.audit) {
    L.push(`AUDIT: AI-readiness ${g.audit.avgScore ?? 'n/a'}/100 over ${g.audit.pages ?? 0} pages.`);
    if (g.audit.issues?.length) {
      L.push('MEASURED PROBLEMS:\n'
        + [...new Set(g.audit.issues.slice(0, 14).map(humanise))].map(x => `- ${x}`).join('\n'));
    }
  }
  if (g.probe?.verdict) {
    L.push(`AN AI ENGINE (${g.probe.engine ?? 'one engine'}) WAS ASKED "${g.probe.question ?? ''}" AND ITS ANSWER WAS JUDGED "${g.probe.verdict}".`
      + (g.probe.answer ? `\nVERBATIM: ${cap(g.probe.answer, 700)}` : ''));
  }
  if (g.breakAt) L.push(`FUNNEL DIAGNOSIS: the break is at station "${g.breakAt}".`);
  return L.join('\n\n');
}

/**
 * @param sections how much of the playbook to carry. Two is usually the method
 *   and the output format, which is what the model needs; more mostly adds
 *   examples it will copy verbatim.
 */
export function runPrompt(skill: string, pb: Playbook, g: Ground, sections = 3): string {
  const zh = g.lang === 'zh';
  const method = (pb.sections ?? []).slice(0, sections)
    .map(s => `## ${s.h}\n${cap(s.b, 1800)}`).join('\n\n');
  return `You are applying ONE marketing methodology to ONE company. Not summarising the
methodology — applying it, and returning what it concludes about this company.

THE METHODOLOGY ("${skill}"${pb.about ? ` — ${pb.about}` : ''}):
${method}

EVERYTHING YOU KNOW ABOUT THE COMPANY:
${brief(g)}

Answer in this order, and the order is the point:

1. Does this methodology apply to this business at all? A pricing playbook has
   nothing to say about a free open-source tool. Say "n/a" with a reason rather
   than manufacturing relevance.
2. What would it take to run this properly that you have NOT been given? List
   it. This is required even when you can answer — a reader must be able to see
   the difference between a finding and a guess.
3. Only then, the finding.

Hard rules:
- Never invent a number, a customer, a competitor, or a claim about this company.
  Everything in "evidence" must be traceable to the material above.
- If the material is thin, say status "partial" and keep the verdict narrow.
  A confident answer on no data is the worst output you can produce here.
- Actions must be things this company can do this week, each with a check
  anyone could apply without asking you.
- No preamble, no restating the methodology.
${zh ? '- verdict / claim / do / doneWhen / needs 全部用简体中文；skill 名和技术词保持原文。' : ''}

Reply with JSON only:
{"status":"ran|partial|n/a|blocked",
 "verdict":"<one sentence>",
 "findings":[{"claim":"...","evidence":"..."}],
 "actions":[{"do":"...","doneWhen":"...","priority":"P0|P1|P2"}],
 "needs":["..."]}`;
}

/** Bounded so one bad reply cannot bloat a stored project. */
const LIMITS = { findings: 5, actions: 4, needs: 5, text: 400 };

const str = (v: unknown, n = LIMITS.text) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Parse and clamp a reply. Invalid shapes become a 'blocked' run rather than
 * throwing: one skill failing must not take down a sixty-nine-step pipeline,
 * and a visible failed row is more use than a silently missing one.
 */
export function parseRun(skill: string, domain: string, raw: unknown): SkillRun {
  const o = (raw ?? {}) as Record<string, any>;
  const status: RunStatus = ['ran', 'partial', 'n/a', 'blocked'].includes(o.status) ? o.status : 'blocked';
  const findings: Finding[] = Array.isArray(o.findings)
    ? o.findings.slice(0, LIMITS.findings)
        .map((f: any) => ({ claim: str(f?.claim), evidence: str(f?.evidence) }))
        .filter((f: Finding) => f.claim)
    : [];
  const actions: Action[] = Array.isArray(o.actions)
    ? o.actions.slice(0, LIMITS.actions)
        .map((a: any) => ({
          do: str(a?.do), doneWhen: str(a?.doneWhen),
          priority: ['P0', 'P1', 'P2'].includes(a?.priority) ? a.priority : 'P1',
        }))
        .filter((a: Action) => a.do)
    : [];
  return {
    skill, domain, status,
    verdict: str(o.verdict, 300),
    findings, actions,
    needs: Array.isArray(o.needs) ? o.needs.slice(0, LIMITS.needs).map((n: any) => str(n, 160)).filter(Boolean) : [],
    ...(status === 'blocked' && !o.verdict ? { error: 'unparseable reply' } : {}),
  };
}

export interface Tier {
  id: string;
  zh: string;
  en: string;
  /** Skills whose output belongs at this level. */
  skills: string[];
}

/**
 * What comes back, and in what order. A pile of sixty-nine reports is not a
 * deliverable — the tiers are the deliverable, because they answer a reader's
 * questions in the order the reader actually has them.
 */
export const TIERS: Tier[] = [
  { id: 'strategy', zh: '① 说得清 · 你是什么、打谁、这季度打哪', en: '① Strategy',
    skills: ['product-marketing', 'marketing-plan', 'competitor-profiling', 'competitors',
             'competitor-analysis', 'customer-research', 'marketing-council', 'marketing-ideas',
             'marketing-psychology'] },
  { id: 'discover', zh: '② 找得到 · 买家去找的时候能不能找到你', en: '② Discoverable',
    skills: ['ai-seo', 'geo-content-optimizer', 'seo-audit', 'technical-seo-checker',
             'on-page-seo-auditor', 'schema', 'schema-markup-generator', 'entity-optimizer',
             'keyword-research', 'serp-analysis', 'rank-tracker', 'content-gap-analysis',
             'internal-linking-optimizer', 'site-architecture', 'programmatic-seo',
             'meta-tags-optimizer', 'directory-submissions', 'aso', 'free-tools'] },
  { id: 'comprehend', zh: '③ 看得懂 · 找到了，读得懂、摘得走吗', en: '③ Comprehensible',
    skills: ['content-strategy', 'seo-content-writer', 'copywriting', 'copy-editing',
             'content-quality-auditor', 'content-refresher', 'video', 'image', 'ad-creative',
             'emails', 'lead-magnets'] },
  { id: 'trust', zh: '④ 信得过 · 除了你自己，谁替你背书', en: '④ Credible',
    skills: ['domain-authority-auditor', 'backlink-analyzer', 'public-relations', 'co-marketing',
             'influencer-marketing', 'community-marketing', 'referrals', 'social'] },
  { id: 'convert', zh: '⑤ 买得下 · 信了之后，买得成吗', en: '⑤ Convertible',
    // Pricing and offers sit here, not in strategy. They are strategic decisions,
    // but in the funnel they are station ⑤ — and putting them in strategy
    // exempted them from the priority cap, which is how a pricing playbook came
    // to demand a 500-response survey while saying pricing was not the problem.
    skills: ['cro', 'ab-testing', 'onboarding', 'signup', 'paywalls', 'popups',
             'churn-prevention', 'offers', 'pricing'] },
  { id: 'spread', zh: '⑥ 传得开 · 一个客户能不能带来下一个', en: '⑥ Compounding',
    skills: ['launch', 'ads', 'cold-email', 'sms', 'prospecting', 'sales-enablement'] },
  { id: 'run', zh: '⑦ 跑得动 · 怎么知道有没有用，以及自己跑起来', en: '⑦ Measure and run',
    skills: ['analytics', 'attribution', 'performance-reporter', 'alert-manager', 'revops',
             'marketing-loops', 'memory-management'] },
];

export function tierOf(skill: string): string {
  for (const t of TIERS) if (t.skills.includes(skill)) return t.id;
  return 'strategy';
}

/**
 * Run order. The break station comes first, because everything downstream of a
 * break is work you cannot bank yet — a content plan is wasted while AI crawlers
 * cannot read the site. Strategy runs before all of it: without knowing what the
 * company is, every other methodology is applying itself to a guess.
 */
export function order(skills: string[], breakAt?: string | null): string[] {
  const STATION_TIER: Record<string, string> = {
    positioned: 'strategy', demanded: 'strategy', discoverable: 'discover',
    comprehensible: 'comprehend', credible: 'trust', convertible: 'convert',
    compounding: 'spread',
  };
  const hot = breakAt ? STATION_TIER[breakAt] : undefined;
  const rank = (s: string) => {
    const t = tierOf(s);
    if (t === 'strategy') return 0;
    if (hot && t === hot) return 1;
    return 2 + TIERS.findIndex(x => x.id === t);
  };
  return [...skills].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The seven-station rule, applied to the engine's own output.
 *
 * A methodology downstream of the break will still hand you a P0, because from
 * inside that methodology the problem is urgent. It is not: work below a break
 * cannot be banked. A real run had `pricing` correctly conclude "pricing is
 * secondary, the constraint is that nobody can find you" and then issue a P0
 * asking for a 500-response survey. Both cannot be true.
 *
 * So priority is capped by position rather than argued about in the prompt: only
 * strategy and the broken tier may claim P0, and everything downstream is at
 * most P1. The action survives, its claim on today does not.
 */
export function capPriority(runs: SkillRun[], breakAt?: string | null): SkillRun[] {
  const STATION_TIER: Record<string, string> = {
    positioned: 'strategy', demanded: 'strategy', discoverable: 'discover',
    comprehensible: 'comprehend', credible: 'trust', convertible: 'convert',
    compounding: 'spread',
  };
  const hot = breakAt ? STATION_TIER[breakAt] : undefined;
  if (!hot) return runs;
  const rank = (t: string) => TIERS.findIndex(x => x.id === t);
  const hotRank = rank(hot);
  return runs.map(r => {
    const t = tierOf(r.skill);
    if (t === 'strategy' || t === hot || rank(t) < hotRank) return r;
    return {
      ...r,
      actions: r.actions.map(a => a.priority === 'P0'
        ? { ...a, priority: 'P1' as const,
            doneWhen: a.doneWhen + ` — ${r.skill} 在断点下游，先修断点再做这条` }
        : a),
    };
  });
}

/**
 * Where independent methodologies agree.
 *
 * A real run of sixty-seven playbooks produced two hundred and two actions,
 * which is the "a list of twelve gets none of them done" failure at scale. But
 * the run also contained the answer: four unrelated methodologies —
 * competitor-analysis, competitors, customer-research and marketing-council —
 * each arrived at "publish a comparison page against ElevenLabs" without seeing
 * each other's output.
 *
 * That convergence is the strongest signal in the whole artefact and it was
 * being rendered as four rows of noise. Agreement between methodologies that
 * reason from different starting points is worth more than any one of them
 * being confident, so actions are clustered and ranked by how many distinct
 * playbooks landed on them.
 *
 * The clustering is deliberately dumb — shared significant words, no model call.
 * A smarter clusterer would merge things that are only superficially alike, and
 * a merge is destructive: it hides an action rather than ranking it.
 */
export interface Converged {
  /** The clearest phrasing among the members. */
  do: string;
  doneWhen: string;
  priority: 'P0' | 'P1' | 'P2';
  /** Distinct playbooks that independently arrived here. */
  skills: string[];
  tiers: string[];
  /** Every phrasing, so a reader can check the merge rather than trust it. */
  variants: string[];
}

/** Words that carry no signal for matching two Chinese or English actions. */
const STOP = new Set([
  'the','a','an','and','or','to','of','for','in','on','with','your','you','add','use','make',
  '在','的','和','与','或','把','将','为','对','了','个','中','上','并','以','及','等','一个','这个',
]);

function tokens(s: string): Set<string> {
  const t = new Set<string>();
  const src = String(s).toLowerCase();
  for (const w of src.match(/[a-z0-9]+/g) ?? []) if (w.length > 1 && !STOP.has(w)) t.add(w);
  // Chinese gets character bigrams rather than fixed-width chunks. Chunking
  // "做一个和|的对比页" and "在官网新增|对比 ElevenLabs" produces tokens that
  // cannot match even when the two sentences say the same thing; bigrams of
  // adjacent characters survive the difference in phrasing.
  for (const run of src.match(/[一-龥]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) {
      const g = run.slice(i, i + 2);
      if (!STOP.has(g)) t.add(g);
    }
  }
  return t;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}

/**
 * @param threshold how much of the smaller action's vocabulary must be shared.
 *   Measured on a real run rather than guessed. Three restatements of the same
 *   comparison page scored 0.43–0.67 against each other; every unrelated pair
 *   scored 0.00. The gap is wide, so the threshold sits at 0.4 — inside the
 *   empty space, not on the edge of either cluster.
 */
export function converge(
  actions: Array<Action & { skill: string; tier: string }>,
  threshold = 0.4,
): Converged[] {
  const P = { P0: 0, P1: 1, P2: 2 } as Record<string, number>;
  // Words most actions share carry no signal and actively mislead. On a real
  // run "在页面添加" glued "add a publish date", "add an author byline" and
  // "add a FAQ block" into one cluster — three different jobs that happened to
  // start the same way. Anything appearing in more than a quarter of the
  // actions is dropped, which leaves the rare words that actually distinguish
  // one piece of work from another.
  const raw = actions.map(a => tokens(a.do));
  const df = new Map<string, number>();
  for (const t of raw) for (const x of t) df.set(x, (df.get(x) ?? 0) + 1);
  // Needs enough documents to mean anything. Under a dozen actions, "appears
  // twice" is not evidence a word is generic — it is most of the corpus — and
  // filtering there strips exactly the shared vocabulary that should match.
  const common = actions.length >= 12 ? Math.ceil(actions.length * 0.25) : Infinity;
  const rare = (t: Set<string>) => {
    const out = new Set<string>();
    for (const x of t) if ((df.get(x) ?? 0) < common) out.add(x);
    // A sentence made entirely of common words keeps them: dropping everything
    // would make it match nothing, which is a different lie from matching all.
    return out.size ? out : t;
  };
  const clusters: Array<{ toks: Set<string>; items: Array<Action & { skill: string; tier: string }> }> = [];
  // Compared against the seed, never against a growing union. Letting the
  // cluster's vocabulary accumulate is single-link chaining, and on a real run
  // it collapsed fifty-nine unrelated actions into one: each new item only had
  // to match *something* the pile had already absorbed. A cluster that swallows
  // most of the run is worse than no clustering, because it looks like the
  // strongest possible agreement.
  actions.forEach((a, i) => {
    const t = rare(raw[i]);
    const hit = clusters.find(c => overlap(t, c.toks) >= threshold);
    if (hit) hit.items.push(a);
    else clusters.push({ toks: t, items: [a] });
  });
  return clusters.map(c => {
    const skills = [...new Set(c.items.map(i => i.skill))];
    const tiers = [...new Set(c.items.map(i => i.tier))];
    // The shortest phrasing is usually the clearest; the longest is usually the
    // one that smuggled three actions into one sentence.
    const clearest = [...c.items].sort((a, b) => a.do.length - b.do.length)[0];
    const best = [...c.items].sort((a, b) => (P[a.priority] ?? 3) - (P[b.priority] ?? 3))[0];
    return {
      do: clearest.do,
      doneWhen: clearest.doneWhen,
      priority: best.priority,
      skills, tiers,
      variants: [...new Set(c.items.map(i => i.do))],
    };
  }).sort((a, b) =>
    // Agreement first, then urgency. Four methodologies at P1 beats one at P0:
    // the single confident voice is the one most likely to be wrong.
    b.skills.length - a.skills.length
    || (P[a.priority] ?? 3) - (P[b.priority] ?? 3)
    || a.do.localeCompare(b.do));
}

export interface EngineSummary {
  total: number;
  ran: number;
  partial: number;
  na: number;
  blocked: number;
  /** Every action across every run, highest priority first. */
  actions: Array<Action & { skill: string; tier: string }>;
  /** What the whole engine says it is missing, deduped. */
  needs: string[];
  /** Actions clustered by agreement — the list a person actually works from. */
  converged: Converged[];
}

export function summarise(runs: SkillRun[]): EngineSummary {
  const actions = runs.flatMap(r =>
    r.actions.map(a => ({ ...a, skill: r.skill, tier: tierOf(r.skill) })));
  const P = { P0: 0, P1: 1, P2: 2 } as Record<string, number>;
  actions.sort((a, b) => (P[a.priority] ?? 3) - (P[b.priority] ?? 3));
  const needs: string[] = [];
  const seen = new Set<string>();
  for (const r of runs) for (const n of r.needs) {
    const k = n.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(k)) { seen.add(k); needs.push(n); }
  }
  return {
    total: runs.length,
    ran: runs.filter(r => r.status === 'ran').length,
    partial: runs.filter(r => r.status === 'partial').length,
    na: runs.filter(r => r.status === 'n/a').length,
    blocked: runs.filter(r => r.status === 'blocked').length,
    actions, needs,
    converged: converge(actions),
  };
}
