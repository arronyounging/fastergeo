/**
 * Suggest mining ("拓词") — real search-demand expansion without API keys.
 *
 * Baidu suggest and Google autocomplete reflect what people actually type.
 * Mined phrases are CANDIDATES for the question bank, never auto-added:
 * the methodology holds question banks constant across periods, so adding
 * questions is a human decision that starts a new series.
 *
 * Failures are reported per engine, not hidden — an empty result must be
 * distinguishable from "the request failed".
 */

export interface SuggestCandidate {
  text: string;
  source: 'baidu' | 'google';
  /** Suggest source implies the market of the demand signal. */
  market: 'cn' | 'global';
  /** The query that produced this suggestion. */
  seedQuery: string;
}

export interface SuggestReport {
  seed: string;
  fetchedAt: string;
  candidates: SuggestCandidate[];
  /** Engines that errored, with the reason — never silently empty. */
  failures: Array<{ engine: 'baidu' | 'google'; query: string; reason: string }>;
}

/** Parse Baidu's JSONP: window.baidu.sug({q:"..",p:false,s:["a","b"]}); */
export function parseBaiduSuggest(body: string): string[] {
  const m = /s\s*:\s*(\[[^\]]*\])/.exec(body);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1].replace(/'/g, '"'));
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Parse Google's firefox-client JSON: ["query", ["a","b",...]] */
export function parseGoogleSuggest(body: string): string[] {
  try {
    const arr = JSON.parse(body);
    return Array.isArray(arr?.[1])
      ? arr[1].filter((x: unknown): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Demand-intent modifiers appended to the seed for a second suggest round. */
const MODIFIERS_CN = ['怎么样', '推荐', '哪家好', '对比', '排行'];
const MODIFIERS_EN = ['best', 'vs', 'review', 'alternative', 'how to'];

export interface MineOptions {
  engines?: Array<'baidu' | 'google'>;
  /** Expand with intent modifiers (one extra suggest round per modifier). */
  expand?: boolean;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

async function fetchSuggest(
  engine: 'baidu' | 'google',
  query: string,
  opts: Required<Pick<MineOptions, 'timeoutMs' | 'fetchFn'>>,
): Promise<string[]> {
  // ie/oe force UTF-8 — Baidu's suggest endpoint answers in GBK by default.
  const url = engine === 'baidu'
    ? `https://suggestion.baidu.com/su?wd=${encodeURIComponent(query)}&ie=utf-8&oe=utf-8`
    : `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const res = await opts.fetchFn(url, { signal: AbortSignal.timeout(opts.timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  return engine === 'baidu' ? parseBaiduSuggest(body) : parseGoogleSuggest(body);
}

export async function mineSuggestions(seed: string, options: MineOptions = {}): Promise<SuggestReport> {
  const engines = options.engines ?? ['baidu', 'google'];
  const timeoutMs = options.timeoutMs ?? 8000;
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
  const candidates: SuggestCandidate[] = [];
  const failures: SuggestReport['failures'] = [];
  const seen = new Set<string>();

  const queriesFor = (engine: 'baidu' | 'google'): string[] => {
    if (!options.expand) return [seed];
    const mods = engine === 'baidu' ? MODIFIERS_CN : MODIFIERS_EN;
    return [seed, ...mods.map(m => `${seed} ${m}`)];
  };

  for (const engine of engines) {
    const market = engine === 'baidu' ? 'cn' as const : 'global' as const;
    for (const query of queriesFor(engine)) {
      try {
        for (const text of await fetchSuggest(engine, query, { timeoutMs, fetchFn })) {
          const key = `${engine}:${text}`;
          if (text === seed || seen.has(key)) continue;
          seen.add(key);
          candidates.push({ text, source: engine, market, seedQuery: query });
        }
      } catch (err) {
        failures.push({ engine, query, reason: String((err as Error).message ?? err) });
      }
    }
  }

  return { seed, fetchedAt: new Date().toISOString(), candidates, failures };
}
