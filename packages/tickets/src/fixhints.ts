/**
 * Fix hints — the "how to actually do it" paragraph attached to every ticket.
 *
 * Written for an engineer who has never heard of GEO. Discipline: every hint
 * answers three questions in order — WHERE to change, WHAT to write (with a
 * copy-pasteable example), and HOW to know it's done (a self-check that maps
 * 1:1 to the ticket's acceptance criterion). Builder-specific branches
 * (Next.js / Nuxt / WordPress / Shopify / static) where the fix differs.
 *
 * Executability bar (bench/run.mjs tickets): a judge playing a non-GEO
 * engineer must rate ≥80% of tickets "executable without questions".
 */

export type HintLang = 'en' | 'zh';

const H: Record<HintLang, Record<string, string[]>> = {
  en: {
    'unblock-robots': [
      'Where: the robots.txt file at your web root (https://yoursite.com/robots.txt — usually public/robots.txt in your repo, or a plugin/setting on WordPress/Shopify).',
      'What: find the "User-agent:" groups naming the listed crawlers and delete their "Disallow: /" lines (or change to "Allow: /"). Example — delete these two lines:',
      '  User-agent: OAI-SearchBot',
      '  Disallow: /',
      'Do NOT touch groups for GPTBot / CCBot / Google-Extended — those control model TRAINING and blocking them is a policy choice, not a bug.',
      'Check: open https://yoursite.com/robots.txt in a browser and confirm the crawler names no longer appear with Disallow: /. Then run: npx fastergeo verify — the ticket flips to done automatically.',
    ],
    'spa-shell': [
      'Why: the page HTML contains almost no text — content only appears after the browser runs JavaScript, and AI crawlers do not run JavaScript, so they see an empty page.',
      'Where/what, pick your stack: Next.js → make the page a Server Component (remove "use client" from page-level components) or add static generation; Nuxt → ensure ssr: true in nuxt.config.ts (it is the default — check nobody set it to false), or prerender marketing routes with routeRules { "/": { prerender: true } }; plain Vite/CRA SPA → prerender marketing pages to static HTML (vite-ssg, react-snap) or move them to a static-site generator; Webflow/WordPress/Shopify already render server-side and rarely trigger this.',
      'Check: run curl -s https://yoursite.com/page | grep "a sentence from your visible copy" — the sentence must appear in the raw HTML. Then: npx fastergeo verify.',
    ],
    'llms-txt': [
      'Where: create a plain-text file served at https://yoursite.com/llms.txt (put llms.txt in your public/static folder).',
      'What: a short Markdown map of your site for AI agents. Minimal working example:',
      '  # YourBrand',
      '  > One-sentence description of what YourBrand is.',
      '  ## Docs',
      '  - [Product overview](https://yoursite.com/product): what it does',
      '  - [Pricing](https://yoursite.com/pricing): plans and prices',
      'Note: Google ignores llms.txt; this only helps some engines — that is why it is P2.',
      'Check: open https://yoursite.com/llms.txt in a browser (must return the text, not a 404). Then: npx fastergeo verify.',
    ],
    'sitemap': [
      'Where: https://yoursite.com/sitemap.xml must exist.',
      'What, pick your stack: Next.js → add app/sitemap.ts exporting your URL list (built-in support); Nuxt → npm i @nuxtjs/sitemap and add it to modules; WordPress → built in since 5.5 at /wp-sitemap.xml, or use Yoast; Shopify → automatic at /sitemap.xml, nothing to do; static site → generate once with any sitemap generator and drop the XML file in your public folder. Also add this line to robots.txt: Sitemap: https://yoursite.com/sitemap.xml',
      'Check: open https://yoursite.com/sitemap.xml — you should see XML listing your URLs. Then: npx fastergeo verify.',
    ],
    'no-jsonld': [
      'Where: inside <head> of each affected page template (one <script> tag; in most frameworks add it to the page layout/SEO component).',
      'What: paste and adapt:',
      '  <script type="application/ld+json">',
      '  {"@context":"https://schema.org","@type":"Article","headline":"PAGE TITLE",',
      '   "datePublished":"2026-01-15","dateModified":"2026-08-01",',
      '   "author":{"@type":"Organization","name":"YourBrand"}}',
      '  </script>',
      'Use @type Article for posts/guides, Product for product pages, Organization on the homepage.',
      'Check: paste the page URL into validator.schema.org (0 errors). Then: npx fastergeo verify.',
    ],
    'block-gap:definition': [
      'Why: AI answers "what is X" by lifting a definition sentence. Pages without one are skipped.',
      'Where: the first paragraph right under the page H1 (must be in the top of the page, not the footer).',
      'What: one self-contained sentence in the pattern "X is a Y that Z." Example: "FasterGEO is an open-source toolkit that measures whether AI assistants mention and cite your brand." Name the subject explicitly — do not start with "It is…".',
      'Check: re-run your audit (npx fastergeo verify) — the definition block is detected automatically.',
    ],
    'block-gap:statistics': [
      'Why: sentences with concrete numbers are the single most-cited content type in AI answers.',
      'Where: anywhere in the main body of the affected pages (top half is better).',
      'What: 2–3 sentences each containing a specific number plus its source/date. Example: "In an internal benchmark (June 2026, n=120), setup time dropped 43%, from 21 to 12 minutes." Vague claims ("many users", "significantly faster") do not count — the number must be a digit.',
      'Check: npx fastergeo verify — the statistics block is detected automatically.',
    ],
    'block-gap:comparison': [
      'Where: main body of the affected pages.',
      'What: an HTML <table> (or Markdown table) comparing your product with 1–2 named alternatives across 3+ concrete criteria (price, deploy model, license…). One honest row where a competitor wins increases credibility and citation odds. A styled <div> grid does NOT count — crawlers extract <table> markup.',
      'Check: npx fastergeo verify.',
    ],
    'block-gap:steps': [
      'Where: main body of the affected how-to/setup pages.',
      'What: a numbered list (<ol> or Markdown "1. 2. 3.") of 3+ imperative steps, each starting with a verb: "1. Install the CLI: npm i -g fastergeo. 2. Run npx fastergeo audit --root https://yoursite.com. 3. Open report.html." Prose like "first you should…" does not count — it must be list markup.',
      'Check: npx fastergeo verify.',
    ],
    'block-gap:faq': [
      'Where: a "FAQ" section at the end of the affected pages.',
      'What: 3+ real question-headings (H2/H3 ending in "?") each followed by a 2–4 sentence answer. Write questions the way buyers ask them ("Is X free?", "Does X work with Y?"). Optionally add FAQPage JSON-LD with the same Q/A pairs.',
      'Check: npx fastergeo verify.',
    ],
    'content-short': [
      'Why: pages under ~600 word-equivalents rarely satisfy an AI answer on their own.',
      'Where: the affected pages (listed in the audit report).',
      'What: extend each to 600+ words by adding the missing sections rather than padding: a definition paragraph, a numbers/evidence paragraph, a steps list, and a 3-question FAQ. That structure alone typically adds 300+ useful words.',
      'Check: npx fastergeo verify — word-equivalents are recounted on re-crawl.',
    ],
    'thin-text': [
      'Why: these pages serve real HTML but under 120 word-equivalents of visible text — too thin for any AI answer.',
      'Where: the pages listed in the audit report.',
      'What: either (a) add real body content — a definition line, one evidence paragraph, one list — to clear 120+ words, or (b) if the page is a stub/placeholder nobody needs, add <meta name="robots" content="noindex"> or delete it so it stops diluting the site.',
      'Check: npx fastergeo verify.',
    ],
    'no-date': [
      'Where: each affected page, in two places — visible text near the title AND machine-readable markup in <head>.',
      'What: visible: an "Updated: <month year>" line under the H1 — use today for pages you touch now, the real publish date otherwise. Machine-readable: add datePublished/dateModified to the page JSON-LD (see the JSON-LD ticket example), or <meta property="article:published_time" content="2026-08-01">.',
      'Check: npx fastergeo verify.',
    ],
    'answer-below-fold': [
      'Why: 44.2% of AI citations extract from the top 30% of a page — your answer blocks sit below that line.',
      'Where: the affected pages; this is a MOVE, not a rewrite.',
      'What: cut the definition sentence and the key numbers currently buried mid-page and paste them directly under the H1 as the opening paragraph ("answer-first" order: conclusion → evidence → detail). Long intros, hero carousels and menu boilerplate push answers down — trim them.',
      'Check: npx fastergeo verify — block position is remeasured.',
    ],
    'context-dependent-paragraphs': [
      'Why: AI retrieves your page in isolated chunks. A paragraph starting with "It / This / They" loses its referent when chunked, so the chunk is unusable.',
      'Where: the affected pages — every paragraph whose FIRST word is a pronoun.',
      'What: rewrite each opener to name the subject. Before: "It also supports offline mode." After: "YourBrand also supports offline mode." The island test: read each paragraph alone — if you cannot tell what it is about, name the subject.',
      'Check: npx fastergeo verify.',
    ],
    'stale-content': [
      'Why: pages unmodified for 90+ days lose citation share to fresher sources.',
      'Where: the affected pages (dateModified in report).',
      'What: genuinely refresh each — update at least one number, screenshot or example to current data — then bump dateModified in the JSON-LD and the visible "Updated:" line to today. Bumping the date WITHOUT changing content is detectable and can hurt trust; always change something real.',
      'Check: npx fastergeo verify.',
    ],
    'site-score': [
      'This is a rollup ticket — no separate work. The average rises as you complete the per-issue tickets above (each names its own pages and fix).',
      'Check: after finishing the other page tickets, run npx fastergeo verify; this flips to done when the re-crawl average reaches the target.',
    ],
    'entity-confusion': [
      'Why: the engine answered probe questions about your brand with facts about a DIFFERENT entity (evidence quoted above). This is fixed by anchoring your identity where AI looks, not by on-site copy alone.',
      'What, in order: 1. Complete the entity-wiring ticket (Organization JSON-LD + sameAs) if present. 2. Create/claim consistent profiles that engines treat as ground truth: Wikidata entry, LinkedIn company page, Crunchbase, GitHub org — identical name, one-line description and website URL on all. 3. If a same-named entity exists, add a disambiguation line on your homepage ("YourBrand is a software company, not the YourBrand furniture maker").',
      'Check: nothing manual — next-period sampling (npx fastergeo cycle or verify --samples) re-probes and flips this when confused verdicts hit zero. Expect 2–6 weeks for engines to pick up profile changes.',
    ],
    'entity-wiring': [
      'Where: <head> of your HOMEPAGE only.',
      'What: paste and adapt (sameAs needs ≥2 real profile URLs):',
      '  <script type="application/ld+json">',
      '  {"@context":"https://schema.org","@type":"Organization",',
      '   "name":"YourBrand","url":"https://yoursite.com",',
      '   "logo":"https://yoursite.com/logo.png",',
      '   "description":"One sentence: what YourBrand is.",',
      '   "sameAs":["https://www.linkedin.com/company/yourbrand",',
      '             "https://github.com/yourbrand"]}',
      '  </script>',
      'Check: validator.schema.org shows 0 errors on the homepage. Then: npx fastergeo verify.',
    ],
    'mention-rate': [
      'Why: when users ask category questions without naming you, engines rarely bring you up. This is a rollup metric — it moves through the tickets it spawned, not by itself.',
      'What: 1. Complete the earned-media ticket below (third-party presence drives ~84% of citations). 2. Complete the on-page block tickets so your pages are quotable when engines do look. 3. Publish 1–2 pages answering the exact category questions in your questions.json (the same file the sampling runs on).',
      'Check: nothing manual — next-period sampling (npx fastergeo cycle) remeasures the rate and flips this automatically. Move takes weeks, not days; judge by trend.',
    ],
    'earned-media': [
      'Why: the listed domains are ALREADY cited by AI engines in your category — presence there converts to AI recommendations far faster than your own site (~84% of citations are third-party).',
      'What, per domain type: review/listing sites → submit your product page with accurate name+description; Q&A sites (zhihu, reddit, stackoverflow) → post genuinely useful answers to category questions, mentioning the brand where relevant (no spam); tech-media/blogs → pitch one data-backed story (your benchmark numbers are the hook). Always include the exact brand name and site URL.',
      'Check: manual — mark done when the brand appears on ≥1 listed domain (link it in the ticket note). Citation share is remeasured by the next npx fastergeo cycle run.',
    ],
  },
  zh: {
    'unblock-robots': [
      '改哪：站点根目录的 robots.txt（浏览器打开 https://你的域名/robots.txt 能看到；仓库里通常是 public/robots.txt，WordPress/Shopify 在插件或后台设置里）。',
      '写什么：找到点名这些爬虫的 "User-agent:" 段，删掉其 "Disallow: /" 行（或改为 "Allow: /"）。例如删除这两行：',
      '  User-agent: OAI-SearchBot',
      '  Disallow: /',
      '注意：GPTBot / CCBot / Google-Extended 的段不要动——那些控制的是模型训练，封不封是政策选择，不算问题。',
      '自检：浏览器打开 robots.txt，确认上述爬虫名不再带 Disallow: /；然后跑 npx fastergeo verify，工单自动翻绿。',
    ],
    'spa-shell': [
      '原因：页面 HTML 里几乎没有正文——内容要等浏览器执行 JS 才出现，而 AI 爬虫不执行 JS，看到的是空页。',
      '按你的技术栈改：Next.js → 把页面改成服务端组件（去掉页面级 "use client"）或做静态生成；Nuxt → 确认 nuxt.config.ts 里 ssr: true（默认值，查是否被改成 false），营销页可用 routeRules { "/": { prerender: true } } 预渲染；纯 Vite/CRA SPA → 用 vite-ssg / react-snap 把营销页预渲染成静态 HTML；Webflow/WordPress/Shopify 本身服务端出 HTML，一般不会有此问题。',
      '自检：终端跑 curl -s 页面URL | grep "页面里的一句正文"，原始 HTML 里能搜到这句话才算修好；然后 npx fastergeo verify。',
    ],
    'llms-txt': [
      '改哪：新建纯文本文件，放到静态目录（public/），使 https://你的域名/llms.txt 可访问。',
      '写什么：给 AI 看的站点地图（Markdown）。最小可用示例：',
      '  # 品牌名',
      '  > 一句话说明品牌是做什么的。',
      '  ## 文档',
      '  - [产品介绍](https://你的域名/product)：做什么的',
      '  - [价格](https://你的域名/pricing)：方案与价格',
      '注：Google 不读 llms.txt，只对部分引擎有用——所以是 P2。',
      '自检：浏览器打开 /llms.txt 能看到内容（不是 404）；然后 npx fastergeo verify。',
    ],
    'sitemap': [
      '改哪：让 https://你的域名/sitemap.xml 存在。',
      '按技术栈：Next.js → 新建 app/sitemap.ts 返回 URL 列表（框架内置）；Nuxt → 安装 @nuxtjs/sitemap 并加进 modules；WordPress → 5.5 起自带 /wp-sitemap.xml，或用 Yoast；Shopify → 自动生成，无需操作；纯静态站 → 用任意 sitemap 生成器生成一次，把 XML 放进 public/。另在 robots.txt 里加一行：Sitemap: https://你的域名/sitemap.xml',
      '自检：浏览器打开 /sitemap.xml 能看到 URL 列表的 XML；然后 npx fastergeo verify。',
    ],
    'no-jsonld': [
      '改哪：受影响页面模板的 <head> 里（多数框架加在页面布局或 SEO 组件中），一段 <script> 即可。',
      '写什么（照抄改词）：',
      '  <script type="application/ld+json">',
      '  {"@context":"https://schema.org","@type":"Article","headline":"页面标题",',
      '   "datePublished":"2026-01-15","dateModified":"2026-08-01",',
      '   "author":{"@type":"Organization","name":"品牌名"}}',
      '  </script>',
      '类型选择：文章/指南用 Article，产品页用 Product，首页用 Organization。',
      '自检：把页面 URL 贴进 validator.schema.org，0 报错；然后 npx fastergeo verify。',
    ],
    'block-gap:definition': [
      '原因：AI 回答"X 是什么"时直接摘取定义句，没有定义句的页面会被跳过。',
      '改哪：页面 H1 正下方的第一段（必须在页面前部，不能塞页脚）。',
      '写什么：一句自包含的"X 是一个…的 Y"。示例："FasterGEO 是一个开源工具包，用来测量 AI 助手是否提及并引用你的品牌。"主语必须写品牌名，不能用"它是…"开头。',
      '自检：npx fastergeo verify——定义块会被自动检测。',
    ],
    'block-gap:statistics': [
      '原因：带具体数字的句子是 AI 答案中被引用最多的内容类型。',
      '改哪：受影响页面正文任意位置（越靠前越好）。',
      '写什么：2–3 句各含一个具体数字 + 来源/时间。示例："内部基准测试（2026 年 6 月，n=120）显示，接入耗时从 21 分钟降到 12 分钟，下降 43%。"模糊说法（"很多用户""显著更快"）不算——必须出现阿拉伯数字。',
      '自检：npx fastergeo verify——数字块自动检测。',
    ],
    'block-gap:comparison': [
      '改哪：受影响页面正文。',
      '写什么：一个 HTML <table>（或 Markdown 表格），把自家产品与 1–2 个点名的竞品按 3 个以上具体维度对比（价格、部署方式、许可证…）。诚实保留一行竞品占优的项，可信度和被引率都更高。纯 <div> 排版的"表格"不算——爬虫抽取的是 <table> 标记。',
      '自检：npx fastergeo verify。',
    ],
    'block-gap:steps': [
      '改哪：受影响的教程/上手页正文。',
      '写什么：编号列表（<ol> 或 Markdown 的 1. 2. 3.），3 步以上、每步动词开头："1. 安装 CLI：npm i -g fastergeo。2. 运行 npx fastergeo audit --root https://你的域名。3. 打开 report.html。"散文式"首先你需要…"不算——必须是列表标记。',
      '自检：npx fastergeo verify。',
    ],
    'block-gap:faq': [
      '改哪：受影响页面末尾加一个 FAQ 区。',
      '写什么：3 个以上真实问题作小标题（H2/H3，以问号结尾），每题下 2–4 句回答。问题按买家的问法写（"X 免费吗？""X 支持 Y 吗？"）。可选：再加一段 FAQPage JSON-LD，内容与页面问答一致。',
      '自检：npx fastergeo verify。',
    ],
    'content-short': [
      '原因：低于约 600 词等效的页面很难独立支撑一条 AI 答案。',
      '改哪：体检报告中列出的短页面。',
      '写什么：按缺什么补什么扩到 600+，不是注水：加一段定义、一段数字/证据、一个步骤列表、一个 3 题 FAQ——这套结构通常就能多出 300+ 有效词。',
      '自检：npx fastergeo verify——重抓后重新计数。',
    ],
    'thin-text': [
      '原因：这些页面有真实 HTML 但可见正文不足 120 词等效——薄到无法支撑任何 AI 答案。',
      '改哪：体检报告列出的页面。',
      '写什么：二选一：(a) 补真实正文——一句定义、一段证据、一个列表，超过 120 词；(b) 若是没人需要的占位页，加 <meta name="robots" content="noindex"> 或直接删掉，别稀释整站。',
      '自检：npx fastergeo verify。',
    ],
    'no-date': [
      '改哪：每个受影响页面，两处——标题附近的可见文字 + <head> 里的机器可读标记。',
      '写什么：可见处在 H1 下加"更新于 某年某月"——现在动的页面写今天，其余写真实发布日期；机器可读处在页面 JSON-LD 里加 datePublished/dateModified（见 JSON-LD 工单示例），或 <meta property="article:published_time" content="2026-08-01">。',
      '自检：npx fastergeo verify。',
    ],
    'answer-below-fold': [
      '原因：44.2% 的 AI 引用取自页面前 30%——你的答案块沉在这条线以下。',
      '改哪：受影响页面；这是搬运，不是重写。',
      '写什么：把埋在页面中后段的定义句和关键数字剪下来，贴到 H1 正下方作为开篇段（"答案先行"：结论 → 证据 → 细节）。冗长引言、轮播图、导航样板文字会把答案往下顶——删减它们。',
      '自检：npx fastergeo verify——块位置会重新测量。',
    ],
    'context-dependent-paragraphs': [
      '原因：AI 是按"切块"检索你的页面的。以"它/这/他们"开头的段落被单独切出来后指代丢失，整块作废。',
      '改哪：受影响页面里所有第一个词是代词的段落。',
      '写什么：把段落开头改成点名主语。改前："它还支持离线模式。"改后："品牌名还支持离线模式。"孤岛测试：单独读每一段，读不出主语是谁就改。',
      '自检：npx fastergeo verify。',
    ],
    'stale-content': [
      '原因：90 天以上未更新的页面会把引用份额输给更新鲜的来源。',
      '改哪：报告中列出的过期页面。',
      '写什么：每页做一次真实更新——至少改一个数字、截图或案例到当前数据——再把 JSON-LD 的 dateModified 和可见的"更新于"改成今天。只改日期不改内容是可检测的且伤信任，务必改点真东西。',
      '自检：npx fastergeo verify。',
    ],
    'site-score': [
      '这是汇总工单，没有独立工作量：完成上面各条按问题拆的页面工单（每条都写明页面和改法），均分自然上来。',
      '自检：其余页面工单做完后跑 npx fastergeo verify，重抓均分达标即自动翻绿。',
    ],
    'entity-confusion': [
      '原因：该引擎回答关于你品牌的探测题时，说的是另一个实体的事实（证据见上）。修法是把品牌身份钉在 AI 查证的地方，光改官网文案不够。',
      '按顺序做：1. 若有"实体声明"工单先完成它（Organization JSON-LD + sameAs）。2. 建立/认领引擎当作事实源的一致档案：Wikidata 条目、LinkedIn 公司页、Crunchbase、GitHub 组织——所有档案用完全一致的名称、一句话简介和官网链接；中文市场加做百度百科/搜狗百科词条。3. 若存在同名实体，在首页加一句消歧（"品牌名是一家软件公司，与某某家具厂无关"）。',
      '自检：无需人工——下期采样（npx fastergeo cycle 或 verify --samples）重新探测，confused 归零自动翻绿。引擎吸收档案变更通常要 2–6 周。',
    ],
    'entity-wiring': [
      '改哪：仅首页的 <head>。',
      '写什么（照抄改词，sameAs 至少 2 个真实档案链接）：',
      '  <script type="application/ld+json">',
      '  {"@context":"https://schema.org","@type":"Organization",',
      '   "name":"品牌名","url":"https://你的域名",',
      '   "logo":"https://你的域名/logo.png",',
      '   "description":"一句话：品牌是做什么的。",',
      '   "sameAs":["https://www.linkedin.com/company/你的品牌",',
      '             "https://github.com/你的品牌"]}',
      '  </script>',
      '自检：validator.schema.org 检查首页 0 报错；然后 npx fastergeo verify。',
    ],
    'mention-rate': [
      '原因：用户问品类问题而不点名你时，引擎很少主动提你。这是汇总指标——靠它派生出的具体工单推动，不是一件独立可做的事。',
      '做什么：1. 完成下面的"阵地建设"工单（第三方阵地贡献约 84% 的引用）。2. 完成站内答案块工单，让引擎真来看时你的页面可被摘取。3. 打开你的 questions.json（采样用的同一份题集），挑 1–2 个品类问题各发一篇正面回答的页面。',
      '自检：无需人工——下期采样（npx fastergeo cycle）重测提及率自动判定。见效以周计，看趋势不看单日。',
    ],
    'earned-media': [
      '原因：所列域名已经在你的品类里被 AI 引用——在那里获得存在感，比经营自家官网转化为 AI 推荐快得多（约 84% 的引用来自第三方）。',
      '按域名类型做：评测/收录站 → 提交产品页，名称与简介务必准确；问答社区（知乎、Reddit、V2EX）→ 认真回答品类问题，相关处自然提到品牌（勿刷屏）；科技媒体/博客 → 用你的数据故事投稿（自家基准数字就是钩子）。所有发布都带上准确品牌名 + 官网链接。',
      '自检：人工项——品牌在所列任一域名出现后标记完成（在工单备注贴上链接）。引用份额由下期 npx fastergeo cycle 采样重测。',
    ],
  },
};

/**
 * Impact rank within the same priority — empirically weighted ordering.
 * Sources: GEO-bench (statistics/quote additions strongest visibility lift),
 * 44.2% of citations from top-30% of page, ~84% of citations earned media,
 * entity signals as leading confusion cause. Higher = do first.
 */
export const IMPACT_WEIGHTS: Record<string, number> = {
  'unblock-robots': 100,
  'spa-shell': 95,
  'entity-confusion': 90,
  'entity-wiring': 85,
  'block-gap:statistics': 80,
  'earned-media': 78,
  'mention-rate': 76,
  'block-gap:definition': 74,
  'answer-below-fold': 72,
  'block-gap:faq': 68,
  'block-gap:comparison': 66,
  'context-dependent-paragraphs': 62,
  'block-gap:steps': 60,
  'thin-text': 58,
  'content-short': 55,
  'no-jsonld': 52,
  'no-date': 45,
  'stale-content': 42,
  'sitemap': 38,
  'site-score': 30,
  'llms-txt': 10,
};

export interface HintContext {
  /** Real brand name — substituted for YourBrand/品牌名 placeholders. */
  brand?: string;
  /** Site root URL, e.g. https://example.com. */
  root?: string;
  /** Competitor names observed in sampling — named in the comparison hint. */
  competitors?: string[];
}

/**
 * Placeholders are only for when we genuinely don't know; whenever the audit
 * or metrics carry the real brand/root, the hint speaks in the user's own
 * names — a hint that says "yoursite.com" when we know the site is one more
 * question the engineer has to answer.
 */
export function fixHintFor(key: string, lang: HintLang, ctx: HintContext = {}): string | undefined {
  const lines = H[lang][key];
  if (!lines) return undefined;
  let text = lines.join('\n');
  if (key === 'block-gap:comparison') {
    if (ctx.competitors && ctx.competitors.length > 0) {
      const names = ctx.competitors.slice(0, 3).join(lang === 'zh' ? '、' : ', ');
      text += lang === 'zh'
        ? `\n采样中 AI 实际拿来对比的竞品：${names}——优先和它们对比。`
        : `\nCompetitors AI actually names in sampling: ${names} — compare against these first.`;
    } else {
      text += lang === 'zh'
        ? '\n竞品选择：采样尚无竞品数据——就选销售/客服最常被客户拿来对比的 1–2 家，你自己挑即可。'
        : '\nPicking competitors: no sampling data yet — use the 1–2 alternatives your sales/support hear most often; your own pick is fine.';
    }
  }
  if (ctx.root) {
    const host = ctx.root.replace(/^https?:\/\//, '').replace(/\/$/, '');
    text = text
      .replace(/https:\/\/yoursite\.com/g, ctx.root.replace(/\/$/, ''))
      .replace(/https:\/\/你的域名/g, ctx.root.replace(/\/$/, ''))
      .replace(/你的域名/g, host);
  }
  if (ctx.brand) {
    const slug = ctx.brand.toLowerCase().replace(/\s+/g, '');
    text = text
      .replace(/YourBrand/g, ctx.brand)
      .replace(/yourbrand/g, slug)
      .replace(/你的品牌/g, slug)
      .replace(/品牌名/g, ctx.brand);
  }
  return text;
}

export function impactWeight(key: string): number {
  return IMPACT_WEIGHTS[key] ?? 50;
}
