/**
 * AI crawler user-agent registry + AI referral sources.
 *
 * This is UA-based detection and deliberately separate from audit's
 * AI_CRAWLERS (robots.txt tokens): some robots tokens never appear as user
 * agents (Google-Extended, Applebot-Extended are policy tokens only), so
 * listing them here would produce permanently-zero rows that look like
 * measurements. UA spoofing exists; counts are "requests claiming to be X".
 *
 * purpose:
 * - training:     bulk collection for model training corpora
 * - search-index: crawling to build an AI search index
 * - user-request: real-time fetch triggered by an end user's question —
 *                 the strongest signal that AI answers are consuming a page
 */

export type CrawlerPurpose = 'training' | 'search-index' | 'user-request';

export interface CrawlerSpec {
  id: string;
  operator: string;
  purpose: CrawlerPurpose;
  ua: RegExp;
}

export const AI_UA_CRAWLERS: CrawlerSpec[] = [
  { id: 'GPTBot', operator: 'OpenAI', purpose: 'training', ua: /GPTBot/i },
  { id: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search-index', ua: /OAI-SearchBot/i },
  { id: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user-request', ua: /ChatGPT-User/i },
  { id: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', ua: /ClaudeBot/i },
  { id: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search-index', ua: /Claude-SearchBot/i },
  { id: 'Claude-User', operator: 'Anthropic', purpose: 'user-request', ua: /Claude-User/i },
  { id: 'anthropic-ai', operator: 'Anthropic', purpose: 'training', ua: /anthropic-ai/i },
  { id: 'PerplexityBot', operator: 'Perplexity', purpose: 'search-index', ua: /PerplexityBot/i },
  { id: 'Perplexity-User', operator: 'Perplexity', purpose: 'user-request', ua: /Perplexity-User/i },
  { id: 'GoogleOther', operator: 'Google', purpose: 'training', ua: /GoogleOther/i },
  { id: 'Bytespider', operator: 'ByteDance', purpose: 'training', ua: /Bytespider/i },
  { id: 'CCBot', operator: 'Common Crawl', purpose: 'training', ua: /CCBot/i },
  { id: 'meta-externalagent', operator: 'Meta', purpose: 'training', ua: /meta-externalagent/i },
  { id: 'meta-externalfetcher', operator: 'Meta', purpose: 'user-request', ua: /meta-externalfetcher/i },
  { id: 'Amazonbot', operator: 'Amazon', purpose: 'training', ua: /Amazonbot/i },
  { id: 'Applebot', operator: 'Apple', purpose: 'search-index', ua: /Applebot(?!-)/i },
  { id: 'DuckAssistBot', operator: 'DuckDuckGo', purpose: 'search-index', ua: /DuckAssistBot/i },
  { id: 'cohere-ai', operator: 'Cohere', purpose: 'training', ua: /cohere-ai/i },
  { id: 'MistralAI-User', operator: 'Mistral', purpose: 'user-request', ua: /MistralAI-User/i },
];

export interface ReferralSourceSpec {
  id: string;
  label: string;
  market: 'cn' | 'global';
  host: RegExp;
}

/** Referer hosts that mean "a human clicked out of an AI answer". */
export const AI_REFERRAL_SOURCES: ReferralSourceSpec[] = [
  { id: 'chatgpt', label: 'ChatGPT', market: 'global', host: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i },
  { id: 'perplexity', label: 'Perplexity', market: 'global', host: /(^|\.)perplexity\.ai$/i },
  { id: 'gemini', label: 'Gemini', market: 'global', host: /(^|\.)gemini\.google\.com$/i },
  { id: 'copilot', label: 'Microsoft Copilot', market: 'global', host: /(^|\.)copilot\.microsoft\.com$/i },
  { id: 'claude', label: 'Claude', market: 'global', host: /(^|\.)claude\.ai$/i },
  { id: 'doubao', label: '豆包', market: 'cn', host: /(^|\.)doubao\.com$/i },
  { id: 'kimi', label: 'Kimi', market: 'cn', host: /(^|\.)kimi\.(com|moonshot\.cn)$/i },
  { id: 'yuanbao', label: '腾讯元宝', market: 'cn', host: /(^|\.)yuanbao\.tencent\.com$/i },
  { id: 'yiyan', label: '文心一言', market: 'cn', host: /(^|\.)yiyan\.baidu\.com$/i },
  { id: 'tongyi', label: '通义/千问', market: 'cn', host: /(^|\.)(tongyi\.aliyun\.com|qianwen\.aliyun\.com|tongyi\.com)$/i },
  { id: 'metaso', label: '秘塔', market: 'cn', host: /(^|\.)metaso\.cn$/i },
  { id: 'chatglm', label: '智谱清言', market: 'cn', host: /(^|\.)chatglm\.cn$/i },
];
