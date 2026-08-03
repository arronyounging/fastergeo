<div align="center">

# FasterGEO

**开源 GEO（生成式引擎优化）平台——看清 AI 引擎到底怎么说你的品牌，然后用机器自动验收的工单把它修好。**

唯一同时覆盖中国（豆包/DeepSeek/GLM/Kimi…）与海外（ChatGPT/Claude/Gemini/Perplexity…）AI 引擎的工具。

[English](README.md) · 简体中文

</div>

---

## 为什么做这个

我们给自己的网站跑了第一次诊断，机器 20 分钟发现了人看不见的问题：

- **产品页在对 AI 说"这个分类下没有商品"**——429KB 的 HTML，可见正文只有 23 个词。AI 爬虫不执行 JavaScript，所有产品页都是空壳。
- **两个引擎把品牌张冠李戴成完全不同的公司**——一个说成汽车改装件厂商，另一个煞有介事地给同名男装定制品牌编造了用户评价。LLM 裁判把两起都抓了出来并附原文证据——其中一起，人工通读时漏掉了。
- 四个引擎的无提示提及率：**0%**——品类推荐问题全被竞品占据。

大多数品牌不是在 AI 推荐赛里落后——是**根本不在赛场上**：不被认识，或者更糟，被认成别人。这就是**品牌实体漏斗**要测的东西：

```
认识你 → 不认错你 → 考虑你 → 排上你 → 引用你
```

监测仪表盘都在测漏斗尾部；大多数品牌断在头部。

## 这是给谁用的

- **品牌主 / 营销负责人**——在 [fastergeo.co/zh](https://fastergeo.co/zh/) 输入网址免费检测「AI 眼中的你」，零技术门槛。
- **开发者 / 技术创始人**——`npx fastergeo` 一条命令在本机跑完整闭环：采样、漏斗指标、自动验收工单。
- **代理商 / 顾问**——交付客户可验证的 GEO 服务：诊断报告、工单清单、机器生成的验收表。见 [fastergeo.co/agency](https://fastergeo.co/agency/)。

## 快速开始

```bash
# 1. 从官网一键推导项目底座（事实/竞品/问题库）
npx fastergeo bootstrap --root https://yoursite.com --llm glm

# 2. 看 AI 爬虫眼中的你（不需要任何 Key）
npx fastergeo audit --root https://yoursite.com --urls /,/about,/pricing

# 3. 采样 AI 回答（有什么 Key 用什么；一个都没有就走人工采样表）
npx fastergeo sample --question "XX 有哪些好用的工具？" --providers deepseek,glm
npx fastergeo sheet --questions questions.json    # 零 Key 路线

# 4. 指标 + 认知质量裁判
npx fastergeo metrics --samples samples.jsonl --brand brand.json --judge glm

# 5. 带机器验收标准的工单——修完自动验证
npx fastergeo plan   --root https://yoursite.com --out tickets.json
npx fastergeo verify --tickets tickets.json --root https://yoursite.com

# 6. 单文件 HTML 诊断报告
npx fastergeo report --root https://yoursite.com --out report.html
```

每条命令都可独立使用。数据是你本机的纯 JSON 文件——`git init` 就是备份方案。

## 和市面工具的区别

| | 监测型 SaaS | FasterGEO |
|---|---|---|
| 中国引擎（豆包/GLM/Kimi…） | ✗ | ✓ API + 人工采样表（UI 自动化在路线图上） |
| 认知质量 | 数品牌名出现次数 | **真认识 / 不认识 / 张冠李戴**，附原文证据；混淆自动 P0 告警 |
| 行动闭环 | 给建议 | 工单 → 重抓 → **自动判定** 完成/回归 |
| 内容生成 | 随便写 | 事实约束初稿 + **编造门禁**——每个数字必须溯源到带出处的事实 |
| 指标口径 | 黑箱 | 可复现：算不出显示「未测」绝不编 0；单期波动只作观察，连续两期同向才算趋势 |
| 数据归属 | 厂商云端 | 你的硬盘 |
| 价格 | $99–5,000/月 | 免费自托管——自带 API Key，或者一个都不带 |

从 GeoLook 迁移？`fastergeo metrics --format geolook` 直接重算你的现有采样数据。

## 18 个引擎

| 市场 | API 采样 | 人工采样表 |
|---|---|---|
| 🇨🇳 国内 | 智谱GLM · 豆包(方舟) · DeepSeek · Kimi · MiniMax · 通义千问 · 文心一言 · 讯飞星火 | 纳米AI · 百度AI |
| 🌍 海外 | ChatGPT · Claude · Gemini · Grok · Perplexity | ChatGPT 网页版 · Claude 网页版 · Google AI Overviews |

`fastergeo check` 逐个诊断 Key：无 Key / 鉴权失败 / **鉴权通过但模型未开通** / 网络不可达——每种都给可操作的提示。支持 `HTTPS_PROXY`（国内端点可用 `NO_PROXY` 排除）。

## 四条原则

1. **绝不编造。** 事实只从官网正文提取并带来源 URL，查不到就标待确认；bootstrap 宁可返回空竞品清单也不猜测；初稿里溯源不到的数字过不了门禁。
2. **验收即产品。** 工单做没做完由重抓判定，不靠口头确认；修复腐烂自动打回。
3. **归因谦逊。** 采样天然有噪声，两期同向纪律写在代码里，不是写在脚注里。
4. **中文是一等公民。** 词等效计数、全角断句、中文分词、中文阈值档位——纯拉丁文本度量在中文内容上会静默失效，我们的不会。

## 架构

九个包的 monorepo，每个可独立使用：`rules`（100+ 确定性规则，fork 自 [geo-lint](https://github.com/IJONIS/geo-lint) 并补全 CJK）· `providers`（18 引擎适配 + Key 健康检查）· `metrics`（漏斗指标 + LLM 认知裁判 + 人工采样表）· `audit`（六维体检，实证锚定）· `tickets`（验收 DSL）· `content`（事实库 + 编造门禁 + bootstrap）· `trends`（期历史 + 归因纪律）· `report`（自包含 HTML）· `cli`

```bash
pnpm install && pnpm -r build && pnpm -r test   # 578 个测试
```

## 协议

Apache-2.0。Vendored 代码保留原协议（见各包 NOTICE）。站在 GEO 研究社区的肩膀上：Princeton GEO 论文（KDD '24）、CN-GEO 引用语料库，以及设计文档中致谢的开源项目。
