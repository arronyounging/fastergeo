/**
 * The growth funnel, as the product's spine.
 *
 * Everything this product measures has been arriving as a flat list: a score, a
 * quote, eight tickets. A flat list is a to-do list, and a to-do list is not a
 * methodology — it does not tell you where you are, what is upstream of what,
 * or which of the eight things is the only one that matters this week.
 *
 * So findings are placed on a funnel of seven stations, and the product answers
 * one question before any other: **which station are you breaking at**. Work at
 * a station downstream of the break is wasted, and saying so is more valuable
 * than any individual fix.
 *
 * The stations are ours (doc 16). What is new here is that they now decide what
 * the product shows rather than living in a strategy document nobody opens.
 */

export type StationId = 'positioned' | 'demand' | 'discoverable' | 'comprehensible'
  | 'credible' | 'convertible' | 'compounding';

export type Measurability = 'measured' | 'judged' | 'partial' | 'not-covered';

export interface Station {
  id: StationId;
  n: number;
  /** Named as the question a buyer would ask, not as a metric. */
  q: { en: string; zh: string };
  /** What breaking here feels like from the inside. */
  smell: { en: string; zh: string };
  /**
   * How honestly we can speak about this station. The product covers the middle
   * of the funnel well and the ends barely at all, and pretending otherwise
   * would be the same failure we criticise dashboards for.
   */
  how: Measurability;
  /** Which playbook covers the work at this station. */
  playbook?: string;
}

export const STATIONS: Station[] = [
  {
    id: 'positioned', n: 0, how: 'judged', playbook: 'product-marketing',
    q: { en: 'Can you say what you are?', zh: '你说得清自己是什么吗？' },
    smell: { en: 'Two people at the company describe the product differently, and both are right.',
      zh: '公司里两个人对产品的描述不一样，而且都没说错。' },
  },
  {
    id: 'demand', n: 1, how: 'partial', playbook: 'content-strategy',
    q: { en: 'Is anyone asking for this?', zh: '有人在找这个东西吗？' },
    smell: { en: 'Nobody searches the words you use, and the words they use are not on your site.',
      zh: '没人搜你用的词，而他们用的词你站上没有。' },
  },
  {
    id: 'discoverable', n: 2, how: 'measured', playbook: 'seo-audit',
    q: { en: 'When they look, do they find you?', zh: '他们找的时候，找得到你吗？' },
    smell: { en: 'AI does not name you — or names you as a different company entirely.',
      zh: 'AI 不提你 —— 或者把你说成了另一家公司。' },
  },
  {
    id: 'comprehensible', n: 3, how: 'measured', playbook: 'ai-seo',
    q: { en: 'Having found you, can they quote you?', zh: '找到了，读得懂、引得动吗？' },
    smell: { en: 'AI reads your page and lifts a competitor’s sentence instead.',
      zh: 'AI 读了你的页面，却引用了竞品的句子。' },
  },
  {
    id: 'credible', n: 4, how: 'partial', playbook: 'competitors',
    q: { en: 'Does anyone else vouch for you?', zh: '除了你自己，还有谁替你说话？' },
    smell: { en: 'Every claim about you traces back to your own domain.',
      zh: '关于你的每一句话，最后都只能追回你自己的网站。' },
  },
  {
    id: 'convertible', n: 5, how: 'not-covered', playbook: 'cro',
    q: { en: 'Once convinced, can they act?', zh: '信了之后，下得了单吗？' },
    smell: { en: 'Traffic up, signups flat — and the reflex is to buy more traffic.',
      zh: '流量涨了注册没动 —— 而人的本能是再去买更多流量。' },
  },
  {
    id: 'compounding', n: 6, how: 'not-covered', playbook: 'launch',
    q: { en: 'Does one customer bring the next?', zh: '一个客户会带来下一个吗？' },
    smell: { en: 'Growth stops the day you stop pushing.',
      zh: '你一停下来推，增长就停。' },
  },
];

export const stationOf = (id: StationId) => STATIONS.find(s => s.id === id)!;

/** Which station a ticket belongs to. Ordered: specific patterns win. */
const TICKET_STATION: Array<[RegExp, StationId]> = [
  [/spa-shell|render|noindex|robots|crawler|sitemap|llms\.txt|no_ai_block/i, 'discoverable'],
  [/entity|organization|sameAs|confusion|no_confusion/i, 'discoverable'],
  [/block-gap|answer-below-fold|context-dependent|statistics|definition|faq|steps|comparison/i, 'comprehensible'],
  [/thin|content-short|word.?count|length|relevance/i, 'comprehensible'],
  [/mention.?rate|share.?of.?voice|citation|backlink|off-?site|earned/i, 'credible'],
  [/title|meta.?description|heading|h1/i, 'comprehensible'],
  [/avg_score|site\./i, 'comprehensible'],
];

export function stationForTicket(t: { id?: string; title?: string; acceptance?: { check?: string } }): StationId {
  const hay = [t.acceptance?.check, t.id, t.title].filter(Boolean).join(' ');
  return TICKET_STATION.find(([re]) => re.test(hay))?.[1] ?? 'comprehensible';
}

export interface Diagnosis {
  /** Where the funnel breaks first. Everything downstream waits on this. */
  breakAt: StationId | null;
  /** One sentence: what is wrong, in the user's words. */
  verdict: { en: string; zh: string };
  /** Per-station state, in funnel order. */
  stations: Array<{
    id: StationId;
    state: 'ok' | 'broken' | 'unmeasured' | 'not-covered';
    detail?: { en: string; zh: string };
    ticketCount: number;
  }>;
}

/**
 * Read the funnel.
 *
 * Deliberately refuses to guess. A station we did not measure reports as
 * unmeasured rather than as passing — a funnel that shows five green lights
 * because nothing was checked is worse than no funnel, and it is precisely the
 * failure mode this product exists to argue against.
 */
export function diagnose(input: {
  audit?: { avgScore?: number | null; site?: Record<string, unknown>; pages?: Array<{ blockers?: string[]; wordCount?: number }>; entity?: { organizationSchema?: boolean } };
  probe?: { verdict?: string };
  tickets?: Array<{ id?: string; title?: string; acceptance?: { check?: string } }>;
}): Diagnosis {
  const counts = new Map<StationId, number>();
  for (const t of input.tickets ?? []) {
    const s = stationForTicket(t);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  const blockers = (input.audit?.pages ?? []).filter(p => (p.blockers ?? []).length).length;
  const confused = input.probe?.verdict === 'confused';
  const unknown = input.probe?.verdict === 'unknown';
  const noEntity = input.audit?.entity?.organizationSchema === false;
  const score = input.audit?.avgScore ?? null;

  const st = (id: StationId, state: Diagnosis['stations'][number]['state'], detail?: { en: string; zh: string }) =>
    ({ id, state, ...(detail ? { detail } : {}), ticketCount: counts.get(id) ?? 0 });

  const stations: Diagnosis['stations'] = [
    st('positioned', input.audit ? 'unmeasured' : 'unmeasured', {
      en: 'A judgement, not a measurement — we do not score this from a crawl.',
      zh: '这是判断不是测量 —— 我们不会靠爬一遍网站给它打分。',
    }),
    st('demand', 'unmeasured', {
      en: 'Needs your question bank against real search demand.',
      zh: '需要拿你的问题库去比对真实搜索需求。',
    }),
    blockers
      ? st('discoverable', 'broken', {
        en: `${blockers} page(s) are blank to an AI crawler.`,
        zh: `${blockers} 个页面对 AI 爬虫是空白。`,
      })
      : confused
        ? st('discoverable', 'broken', {
          en: 'An engine describes you as a different company.',
          zh: '有引擎把你说成了另一家公司。',
        })
        : unknown
          ? st('discoverable', 'broken', {
            en: 'The engine we asked does not know who you are.',
            zh: '我们问的引擎不知道你是谁。',
          })
          : input.probe
            ? st('discoverable', 'ok')
            : st('discoverable', 'unmeasured'),
    score === null
      ? st('comprehensible', 'unmeasured')
      : score < 60
        ? st('comprehensible', 'broken', {
          en: `Site AI-readiness ${score}/100 — little here is worth quoting.`,
          zh: `网站 AI 就绪度 ${score}/100 —— 这里没什么值得被引用的。`,
        })
        : st('comprehensible', 'ok'),
    st('credible', 'unmeasured', {
      en: 'Needs sampling across engines to see who they cite in your category.',
      zh: '需要跨引擎采样，才知道你的品类里 AI 信任谁。',
    }),
    st('convertible', 'not-covered', {
      en: 'We do not measure this. If traffic is up and signups are flat, the problem is here — not in visibility.',
      zh: '这一栏我们不测。如果流量涨了而注册没动，问题就在这里，不在可见性。',
    }),
    st('compounding', 'not-covered'),
  ];

  const broken = stations.find(s => s.state === 'broken');
  const breakAt = broken?.id ?? null;

  let verdict: Diagnosis['verdict'];
  if (!broken) {
    verdict = input.probe || input.audit
      ? { en: 'Nothing broken in what we can see. The stations we cannot measure are named below.',
        zh: '我们看得到的部分没有断点。测不了的几站在下面写明了。' }
      : { en: 'Nothing measured yet.', zh: '还什么都没测。' };
  } else {
    const s = stationOf(broken.id);
    verdict = {
      en: `You break at station ${s.n} — ${s.q.en} ${broken.detail?.en ?? ''} Work downstream of this waits.`,
      zh: `你断在第 ${s.n} 站 —— ${s.q.zh}${broken.detail?.zh ?? ''}它后面的活先等着。`,
    };
  }
  return { breakAt, verdict, stations };
}
