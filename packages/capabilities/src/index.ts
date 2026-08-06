/**
 * What this product can do, where each capability shows up, and what is missing.
 *
 * This exists as data rather than a document because the same map is needed in
 * three places — the local workbench, the hosted console, and the planning
 * notes — and a document that has to be updated by hand is out of date by the
 * next commit. It has already happened once here: a "two workbenches will split
 * into two products" warning sat in a planning file for a day while both kept
 * being built.
 *
 * Three questions this is meant to answer, and the fields answer them in order:
 *   what can we do              → id / what
 *   where does the user get it  → surface / block
 *   what is missing             → needs / gap
 *
 * The honest states are what make it useful. `web` means a hosted user sees it
 * today; `cli` means the capability is real but only reachable by running a
 * command; `none` means we decided not to do it. An entry with `block: null`
 * and `surface: 'cli'` is a capability the panel has not caught up to — that is
 * a to-do list nobody has to remember to write.
 */

/** Where a capability is reachable from today. */
export type Surface = 'web' | 'cli' | 'none';

/** The seven domains the panel's tab strip is built from. */
export type Domain = 'demand' | 'visible' | 'content' | 'convert'
  | 'authority' | 'distribute' | 'watch' | 'social' | 'core';

export interface Capability {
  id: string;
  domain: Domain;
  /** One line, in the user's terms — not the function's name. */
  zh: string;
  en: string;
  /** Which package and export actually does it. Empty when it is not ours. */
  pkg: string;
  fn?: string;
  /** Why a buyer cares. Blank is not allowed: a capability nobody can value is
   *  either mis-described or should not ship. */
  valueZh: string;
  valueEn: string;
  surface: Surface;
  /** Panel block id where it appears, or null when the panel has not caught up. */
  block: string | null;
  /** What it needs before it can produce anything. */
  needs: string[];
  /** What stands between it and being on the hosted panel. Empty when it is
   *  already there, or when we decided not to do it. */
  gap?: string;
}

/** The blocks the console actually renders, so `block` cannot point at nothing. */
export const BLOCKS = [
  'wallbar', 'terminal', 'profile.docs', 'profile.competitors', 'profile.rules',
  'evidence.quotes', 'evidence.notrun', 'evidence.funnel', 'evidence.engines',
  'evidence.audit', 'evidence.blocks', 'evidence.entry', 'evidence.domains',
  'today.queue', 'today.state', 'ask.brief', 'ask.contract', 'ask.chat',
] as const;

export const CAPABILITIES: Capability[] = [
  /* ── audit · needs no keys, which is why it is the free tier ─────────── */
  {
    id: 'audit.six-dimensions', domain: 'visible', pkg: '@fastergeo/audit', fn: 'auditPage',
    zh: '页面六维体检', en: 'Six-dimension page audit',
    valueZh: '用 AI 爬虫的眼睛给每一页打分，不需要任何 Key',
    valueEn: 'Scores every page as an AI crawler sees it, with no keys at all',
    surface: 'web', block: 'evidence.audit', needs: ['能抓到的页面'],
  },
  {
    id: 'audit.blocks', domain: 'visible', pkg: '@fastergeo/audit', fn: 'detectBlocks',
    zh: '抽取块检测（定义/对比/数字/步骤/FAQ）', en: 'Extractable block detection',
    valueZh: '整站一种块都没有，正是 AI 回答这类问题时不引用你的原因',
    valueEn: 'A block the whole site lacks is exactly why an AI answering that kind of question does not quote you',
    surface: 'web', block: 'evidence.blocks', needs: ['页面正文'],
  },
  {
    id: 'audit.site', domain: 'visible', pkg: '@fastergeo/audit', fn: 'checkSite',
    zh: '爬虫准入检查（robots / llms.txt / sitemap）', en: 'Crawler access checks',
    valueZh: '挡住 AI 搜索爬虫等于把自己从那些答案里删掉',
    valueEn: 'Blocking AI search crawlers removes you from those answers',
    surface: 'web', block: 'evidence.entry', needs: [],
  },
  {
    id: 'audit.entity', domain: 'visible', pkg: '@fastergeo/audit', fn: 'scorePage',
    zh: '实体声明检查（Organization JSON-LD / sameAs）', en: 'Entity declaration check',
    valueZh: '实体声明空着，是 AI 把你认成别家公司的头号原因',
    valueEn: 'An empty entity declaration is the leading cause of an AI mistaking you for someone else',
    surface: 'web', block: 'evidence.entry', needs: [],
  },
  {
    id: 'audit.botwall', domain: 'visible', pkg: '@fastergeo/audit', fn: 'detectBotWall',
    zh: '机器人墙探测', en: 'Bot wall detection',
    valueZh: '读到的是验证页而不是你的网站时，这一轮所有数字都不作数 —— 会直接停下',
    valueEn: 'When the crawl reads a challenge page instead of your site, every number in the run is void — so the run stops',
    surface: 'web', block: 'wallbar', needs: [],
    gap: '有单元测试，但真实案例复现不了，未经线上验证',
  },

  /* ── content · the documents every other capability reads first ──────── */
  {
    id: 'content.bootstrap', domain: 'core', pkg: '@fastergeo/content', fn: 'bootstrapProject',
    zh: '从网址推导品牌档案', en: 'Derive the brand dossier from a URL',
    valueZh: '所有下游生成都读这一份，改一条，下游全跟着变',
    valueEn: 'Everything downstream reads this one file; change a line and the rest follows',
    surface: 'web', block: 'profile.docs', needs: ['首页 + 3 页可读内容'],
  },
  {
    id: 'content.facts', domain: 'core', pkg: '@fastergeo/content', fn: 'renderDossier',
    zh: '事实分级 A–E + 溯源', en: 'Fact grading A–E with provenance',
    valueZh: '「网站上写的」和「你说的」是两种主张，下游区别对待',
    valueEn: '"Your site says so" and "you say so" are different claims and are treated differently downstream',
    surface: 'web', block: 'profile.docs', needs: [],
  },
  {
    id: 'content.usable', domain: 'core', pkg: '@fastergeo/content', fn: 'assessDossier',
    zh: '「什么都没学到」闸门', en: 'The learned-nothing gate',
    valueZh: '爬完没弄明白你卖什么时直接停，而不是继续算出一份看着很像真的报告',
    valueEn: 'Stops when the crawl did not work out what you sell, instead of computing a real-looking report on nothing',
    surface: 'web', block: 'wallbar', needs: [],
  },
  {
    id: 'content.fabcheck', domain: 'content', pkg: '@fastergeo/content', fn: 'lintFabrication',
    zh: '编造门禁', en: 'Fabrication gate',
    valueZh: '只有已确认且非 E 级的事实能进生成内容 —— 编不出来的就不编',
    valueEn: 'Only confirmed, non-E facts may enter generated content: what cannot be sourced does not get written',
    surface: 'cli', block: null, needs: ['事实库'],
    gap: '网页版没有生成功能，所以门禁也无处可放',
  },
  {
    id: 'content.mine', domain: 'demand', pkg: '@fastergeo/content', fn: 'mineSuggestions',
    zh: '百度下拉 + Google 补全挖真实需求', en: 'Mine real demand from autocomplete',
    valueZh: '题库来自人真的在搜的词，不是我们替你想的词',
    valueEn: 'The question bank comes from what people actually type, not from what we imagined',
    surface: 'cli', block: null, needs: ['种子词'],
    gap: '网页版没接下拉挖掘，题库只从你的网站文字里推',
  },
  {
    id: 'content.draft', domain: 'content', pkg: '@fastergeo/content', fn: 'buildOutline',
    zh: '大纲 / 初稿生成', en: 'Outline and draft generation',
    valueZh: '每一段都对着一个买家真会问的问题写',
    valueEn: 'Every section is written against a question buyers actually ask',
    surface: 'cli', block: null, needs: ['题库', '事实库'],
    gap: '网页版没接生成',
  },

  /* ── metrics · the crown jewels, and mostly not on the hosted side ───── */
  {
    id: 'metrics.recognition', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'classifyRecognition',
    zh: '认知判定：认识 / 认错 / 不认识', en: 'Recognition: knows / confused / unknown',
    valueZh: '「AI 不推荐你」和「AI 不知道你是谁」是两个病，修法完全不同',
    valueEn: '"AI does not recommend you" and "AI does not know who you are" are different illnesses with different cures',
    surface: 'web', block: 'evidence.funnel', needs: ['点名题采样', '一个可用引擎'],
    gap: '网页版只问 1 个引擎',
  },
  {
    id: 'metrics.mention', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'computeMetrics',
    zh: '提及率 / 排名 / 前三率', en: 'Mention rate, rank, top-3',
    valueZh: '买家不点名问的时候，AI 报不报你的名字 —— 这才是可见度',
    valueEn: 'Whether an AI names you when the buyer did not — that is visibility',
    surface: 'cli', block: 'evidence.funnel', needs: ['不点名题采样'],
    gap: '网页版没做不点名采样，③④ 两道闸永远是「未测」',
  },
  {
    id: 'metrics.early', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'computeMetrics',
    zh: '位置加权可见度（答案前 30% 才算数）', en: 'Position-weighted visibility',
    valueZh: '被提到但埋在第八段，和被第一句点名，不是一回事',
    valueEn: 'Mentioned in paragraph eight is not the same as named in the first sentence',
    surface: 'cli', block: null, needs: ['不点名题采样'],
    gap: '面板从来没画过这个数',
  },
  {
    id: 'metrics.sov', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'computeMetrics',
    zh: '声量份额（你 vs 竞品）', en: 'Share of voice',
    valueZh: '同一个问题里，AI 提你几次、提对手几次',
    valueEn: 'In the same answer, how often it names you versus your rivals',
    surface: 'cli', block: null, needs: ['不点名题采样', '已核实的竞品集'],
    gap: '面板没画；竞品集为空时这个数无定义（不是 100%）',
  },
  {
    id: 'metrics.sentiment', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'classifySentiment',
    zh: '提及情感 + 负面原话', en: 'Sentiment of mentions, with quotes',
    valueZh: '被提到不等于被说好话，负面原话每一条都是一张工单',
    valueEn: 'Being mentioned is not being praised; every negative quote is a ticket',
    surface: 'cli', block: 'evidence.quotes', needs: ['不点名题采样'],
    gap: '网页版没采样，所以这一栏永远显示「本期没有」',
  },
  {
    id: 'metrics.sources', domain: 'authority', pkg: '@fastergeo/metrics', fn: 'analyzeCitationSources',
    zh: 'AI 实际引用了哪些域名', en: 'Which domains AI actually cites',
    valueZh: '这就是你的公关靶单 —— 别处拿不到的一份清单',
    valueEn: 'That list is your PR target list, and no other tool can produce it',
    surface: 'cli', block: null, needs: ['联网引擎采样'],
    gap: '18 个引擎里只有 5 个联网、会返回引用来源，且都要手工采样表',
  },
  {
    id: 'metrics.aliases', domain: 'core', pkg: '@fastergeo/metrics', fn: 'suggestAliases',
    zh: '品牌别名建议', en: 'Brand alias suggestions',
    valueZh: '漏一个别名，提及就少算一次 —— 这是最高杠杆的一处人工修正',
    valueEn: 'A missing alias silently under-counts every mention: the highest-leverage correction a user can make',
    surface: 'cli', block: null, needs: ['采样'],
    gap: '面板没画',
  },
  {
    id: 'metrics.sheet', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'renderSampleSheet',
    zh: '手工采样表（零 Key 也能测）', en: 'Manual sampling sheet',
    valueZh: '一个 Key 都不配也能测 —— 把问题贴进 AI 网页版，把回答贴回来',
    valueEn: 'Measurable with no keys at all: paste the questions into any AI web app and paste the answers back',
    surface: 'cli', block: null, needs: [],
    gap: '网页版完全没暴露 —— 而这是唯一能测「引用」的零成本路径',
  },
  {
    id: 'metrics.ci', domain: 'visible', pkg: '@fastergeo/metrics', fn: 'wilsonInterval',
    zh: '样本量置信区间', en: 'Confidence interval on sample size',
    valueZh: '2 条样本算出的 50%，和 200 条算出的 50%，不是同一个数',
    valueEn: '50% from two samples and 50% from two hundred are not the same number',
    surface: 'cli', block: null, needs: ['采样'],
    gap: '面板没画；现在只写分母，没写区间',
  },

  /* ── providers ───────────────────────────────────────────────────────── */
  {
    id: 'providers.engines', domain: 'visible', pkg: '@fastergeo/providers', fn: 'resolveProvider',
    zh: '18 个引擎驱动（中 10 / 外 8）', en: '18 engine drivers (10 China, 8 global)',
    valueZh: '中国那 10 个是同类产品结构性没有的',
    valueEn: 'The ten China engines are something comparable products structurally do not have',
    surface: 'cli', block: 'evidence.engines', needs: ['每个引擎一个 Key'],
    gap: '托管采样没做 —— 网页用户只能看到 12 行「未跑」',
  },
  {
    id: 'providers.health', domain: 'visible', pkg: '@fastergeo/providers', fn: 'checkProvider',
    zh: '引擎健康检查', en: 'Engine health check',
    valueZh: '分不清「引擎挂了」和「你没配 Key」，会把故障当成结论',
    valueEn: 'Confusing "the engine failed" with "you have no key" turns an outage into a finding',
    surface: 'cli', block: null, needs: [],
    gap: '网页版没有引擎配置，也就没有健康状态可显示',
  },

  /* ── tickets ─────────────────────────────────────────────────────────── */
  {
    id: 'tickets.generate', domain: 'core', pkg: '@fastergeo/tickets', fn: 'generateTickets',
    zh: '带机器验收判据的工单', en: 'Tickets with machine-checkable acceptance',
    valueZh: '每条都写明「修到什么程度算好」，不是「建议优化」',
    valueEn: 'Every one states what done looks like, instead of "consider improving"',
    surface: 'web', block: 'today.queue', needs: ['体检结果'],
  },
  {
    id: 'tickets.verify', domain: 'core', pkg: '@fastergeo/tickets', fn: 'verifyTickets',
    zh: '重爬验收 + 回归打回', en: 'Re-crawl verification, regressions flip back',
    valueZh: '你说好了不算，重爬说了算 —— 没真修好的会自己回来',
    valueEn: 'Done means re-crawled, not asserted: what was not actually fixed comes back on its own',
    surface: 'web', block: 'today.state', needs: ['每日循环'],
  },
  {
    id: 'tickets.diagnose', domain: 'core', pkg: '@fastergeo/tickets', fn: 'diagnose',
    zh: '七站断点漏斗', en: 'Seven-station break funnel',
    valueZh: '断在哪一站，后面的活就先别干 —— 修错站等于白花钱',
    valueEn: 'Work downstream of the break is wasted; fixing the wrong station costs money for nothing',
    surface: 'web', block: 'terminal', needs: ['体检 + 采样'],
    gap: '控制台只在终端里说了一句，没有漏斗视图（诊断页有）',
  },
  {
    id: 'tickets.rank', domain: 'core', pkg: '@fastergeo/tickets', fn: 'rankTickets',
    zh: '按影响排序，只给三件', en: 'Ranked by impact, three at a time',
    valueZh: '给十二件等于一件都不做',
    valueEn: 'A list of twelve gets none of them done',
    surface: 'web', block: 'today.queue', needs: [],
  },
  {
    id: 'tickets.hint', domain: 'core', pkg: '@fastergeo/tickets', fn: 'fixHintFor',
    zh: '逐条修复提示（改哪、写什么、怎么自检）', en: 'Per-ticket fix hints',
    valueZh: '小白照着就能改，不用先去学 GEO',
    valueEn: 'Actionable without first learning what GEO is',
    surface: 'web', block: null, needs: [],
    gap: '诊断页有，控制台的工单卡片没放',
  },
  {
    id: 'tickets.playbook', domain: 'core', pkg: '@fastergeo/tickets', fn: 'playbookFor',
    zh: '工单路由到 71 个方法论', en: 'Tickets routed into 71 playbooks',
    valueZh: '知道要修什么之后，就地能读到怎么修',
    valueEn: 'Once you know what to fix, how to fix it is readable in place',
    surface: 'web', block: null, needs: [],
    gap: '控制台移植时把方法论入口整个丢了 —— 71 个都打包在线上，但点不开',
  },
  {
    id: 'tickets.feed', domain: 'core', pkg: '@fastergeo/tickets', fn: 'mergeFeed',
    zh: '队列合并（已读 / 推迟 / 已修 / 回归）', en: 'Merged queue with state',
    valueZh: '重跑不会洗掉你做过的事 —— 那是你在这里唯一创造的状态',
    valueEn: 'A re-run does not erase what you did: it is the only state you create here',
    surface: 'web', block: 'today.state', needs: [],
  },

  /* ── trends ──────────────────────────────────────────────────────────── */
  {
    id: 'trends.compare', domain: 'watch', pkg: '@fastergeo/trends', fn: 'computeTrends',
    zh: '期对比 + 两期纪律', en: 'Period comparison with the two-period rule',
    valueZh: '单期只算观察，连续两期同向才叫趋势 —— 这条纪律让你不会拿噪声做决定',
    valueEn: 'One period is an observation; only two consecutive same-direction changes are a trend',
    surface: 'web', block: 'evidence.domains', needs: ['两期数据'],
    gap: '第 2 期才会有真对比；这不是被锁住的功能，趋势在物理上需要时间',
  },
  {
    id: 'trends.alerts', domain: 'watch', pkg: '@fastergeo/trends', fn: 'computeTrends',
    zh: '异常告警', en: 'Alerts on real movement',
    valueZh: '只在真的变了的时候说话',
    valueEn: 'Speaks only when something actually moved',
    surface: 'cli', block: null, needs: ['两期数据'],
    gap: '面板没画',
  },

  /* ── the ones with no hosted path at all ─────────────────────────────── */
  {
    id: 'botlog.visits', domain: 'authority', pkg: '@fastergeo/botlog', fn: 'analyzeBotlog',
    zh: 'AI 爬虫到底来没来过', en: 'Whether AI crawlers actually visited',
    valueZh: '「允许进」和「真来过」经常不是一回事',
    valueEn: 'Allowed in and actually came are often not the same thing',
    surface: 'cli', block: null, needs: ['你的服务器访问日志'],
    gap: '网页版拿不到你的日志，只能显示准入那一半',
  },
  {
    id: 'botlog.referral', domain: 'watch', pkg: '@fastergeo/botlog', fn: 'analyzeBotlog',
    zh: 'AI 有没有给你导过流量', en: 'Whether AI sent you any traffic',
    valueZh: '可见度的终点是有人真的点进来',
    valueEn: 'Visibility ends in someone actually arriving',
    surface: 'cli', block: null, needs: ['服务器日志'],
    gap: '同上：网页版拿不到你的服务器日志，这一栏在托管侧无路可走',
  },
  {
    id: 'commerce.products', domain: 'convert', pkg: '@fastergeo/commerce', fn: 'analyzeShopping',
    zh: '商品在 AI 回答里的可见度与价格判定', en: 'Product visibility and price checks in AI answers',
    valueZh: '电商站的可见度落点是单品，不是首页',
    valueEn: 'For a shop, visibility lands on the product, not the homepage',
    surface: 'cli', block: null, needs: ['商品结构化数据'],
    gap: '网页版没接；非电商站也用不上',
  },
  {
    id: 'officialdata.reconcile', domain: 'watch', pkg: '@fastergeo/officialdata', fn: 'reconcile',
    zh: '与 GSC / GA 官方数据对账', en: 'Reconcile against GSC / GA exports',
    valueZh: '我们的判断能和你自己的后台对上，才敢往上加结论',
    valueEn: 'Conclusions are only safe once our reading agrees with your own analytics',
    surface: 'cli', block: null, needs: ['GSC / GA 导出'],
    gap: '网页版没有接入口',
  },
  {
    id: 'publish.to', domain: 'distribute', pkg: '@fastergeo/publish', fn: 'publishTo',
    zh: '发布到 WordPress / GitHub / webhook', en: 'Publish to WordPress / GitHub / webhook',
    valueZh: '唯一一个「往外做」的能力，且发布前强制过编造门禁',
    valueEn: 'The one outbound capability, and it is gated by the fabrication check before it ships',
    surface: 'cli', block: null, needs: ['目标站的凭据'],
    gap: '网页版没有发布通道',
  },
  {
    id: 'report.full', domain: 'core', pkg: '@fastergeo/report', fn: 'renderHtmlReport',
    zh: '完整报告（含 26 条原话逐条回放）', en: 'Full report with verbatim answer replay',
    valueZh: '每个数字都能翻到产生它的那一句话',
    valueEn: 'Every number can be traced to the sentence that produced it',
    surface: 'cli', block: null, needs: [],
    gap: '控制台的「诊断页」不是完整报告，网页版没有导出',
  },
  {
    id: 'report.digest', domain: 'core', pkg: '@fastergeo/report', fn: 'renderTodayDigest',
    zh: '每日摘要 + 每日契约', en: 'Daily digest and the daily contract',
    valueZh: '把「今天系统替你做了什么」说成一句人话',
    valueEn: 'Says what the system did for you today in one plain sentence',
    surface: 'web', block: 'ask.brief', needs: [],
    gap: '网页版是简化版，没有 today.md 那份完整摘要',
  },
  {
    id: 'playbooks.71', domain: 'core', pkg: 'coreyhaines31/marketingskills (MIT)',
    zh: '69 份营销方法论', en: '69 marketing playbooks',
    valueZh: '知道要修什么之后，就地读得到怎么修 —— 出处和许可都随数据带着',
    valueEn: 'How to do it, readable where the work is, with source and licence travelling with the data',
    surface: 'web', block: null, needs: [],
    gap: '打包在线上（/api/playbook 能取），但控制台没有入口',
  },
  {
    id: 'strategy.nine', domain: 'core', pkg: '~/.claude/skills（我们自己写的）',
    zh: '九个策略层 skill（定位 / 渠道 / 指标树 / 增长实验 …）', en: 'Nine strategy skills',
    valueZh: '断点漏斗之上的那一层：本季该打哪、不打哪',
    valueEn: 'The layer above the funnel: what to attack this quarter and what to leave',
    surface: 'none', block: null, needs: [],
    gap: '这九个装在我们自己机器上，是 Claude Code 的 skill，客户拿不到 —— 要产品化才算数',
  },

  {
    id: 'site.ask', domain: 'core', pkg: 'site/functions/api/ask.js',
    zh: '接地问答（只用这个项目自己的数据回答）', en: 'Grounded Q&A',
    valueZh: '答不上来会说缺哪块数据，而不是拿通用知识编一段听着像真的',
    valueEn: 'Says which piece is missing rather than reaching for general knowledge and sounding right',
    surface: 'web', block: 'ask.chat', needs: ['档案 + 体检 + 采样'],
  },
  {
    id: 'content.competitors', domain: 'core', pkg: '@fastergeo/content', fn: 'validateCompetitor',
    zh: '竞品候选 + 人工核对', en: 'Competitor candidates, human-confirmed',
    valueZh: '从你网站文字里猜的一律标成猜的 —— 真正的竞争集来自采样 AI 的回答',
    valueEn: 'Guesses from your own copy are labelled as guesses; the real set comes from sampling AI answers',
    surface: 'web', block: 'profile.competitors', needs: ['首页文字'],
    gap: '只是候选。真竞争集要靠不点名采样，网页版没做',
  },
  {
    id: 'report.contract', domain: 'core', pkg: '@fastergeo/report', fn: 'dailyContract',
    zh: '每日契约：说清每天你会拿到什么', en: 'The daily contract',
    valueZh: '订阅一件天天跑的东西之前，先看清它每天到底交付什么',
    valueEn: 'Before subscribing to something that runs daily, see exactly what it hands you each day',
    surface: 'web', block: 'ask.contract', needs: [],
  },
  /* ── the two we decided not to do ────────────────────────────────────── */
  {
    id: 'convert.none', domain: 'convert', pkg: '',
    zh: '落地页 / 注册流优化', en: 'Landing page and signup optimisation',
    valueZh: '我们能告诉你「流量涨而注册不动，问题在这一栏」，但不替你改',
    valueEn: 'We can tell you traffic-up-signups-flat is a problem here; we do not fix it for you',
    surface: 'none', block: 'evidence.domains', needs: [],
    gap: '决定不做：需要你的分析数据和产品内部，跟「看 AI 怎么说你」不搭',
  },
  {
    id: 'social.none', domain: 'social', pkg: '',
    zh: '社媒监听（HN / Reddit）', en: 'Social listening',
    valueZh: '谁在公开场合问同类问题',
    valueEn: 'Who is asking about this in public',
    surface: 'none', block: 'evidence.domains', needs: [],
    gap: '还没做。HN 走 Algolia 公开 API 免费、Reddit 有免费层 —— 成本不是障碍，只是没排上',
  },
];

export interface CapabilitySummary {
  total: number;
  web: number;
  cli: number;
  none: number;
  /** Capabilities that are real but the hosted panel does not show. */
  unsurfaced: Capability[];
  /** Blocks referenced by no capability. Two are expected and legitimate:
   *  profile.rules is a promise we make, and evidence.notrun states an absence —
   *  neither is a capability, and pretending otherwise to make a number look
   *  tidy is the sort of thing this file exists to prevent. */
  orphanBlocks: string[];
}

export function summarise(caps: Capability[] = CAPABILITIES): CapabilitySummary {
  const used = new Set(caps.map(c => c.block).filter(Boolean) as string[]);
  return {
    total: caps.length,
    web: caps.filter(c => c.surface === 'web').length,
    cli: caps.filter(c => c.surface === 'cli').length,
    none: caps.filter(c => c.surface === 'none').length,
    // A capability that exists and is not on the panel is a to-do list nobody
    // has to remember to keep.
    unsurfaced: caps.filter(c => c.surface === 'cli' && !c.block),
    orphanBlocks: BLOCKS.filter(b => !used.has(b)),
  };
}

/** Group by the domain the panel's tab strip uses. */
export function byDomain(caps: Capability[] = CAPABILITIES): Record<string, Capability[]> {
  const out: Record<string, Capability[]> = {};
  for (const c of caps) (out[c.domain] = out[c.domain] ?? []).push(c);
  return out;
}
