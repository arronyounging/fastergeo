/**
 * Citation-source analysis: which domains does AI actually cite when
 * answering your category's questions?
 *
 * Why it matters: cross-corpus studies consistently find ~84% of AI
 * citations come from earned media, not brand-owned pages (Muck Rack, 25M
 * citations; 5WPR and AirOps independently ~85%). Owned content shapes how
 * AI DESCRIBES you; third-party presence decides whether AI RECOMMENDS you.
 * The domains AI already trusts in your category ARE your PR target list —
 * and they were sitting in your samples' citation URLs all along.
 *
 * cn and global are aggregated separately, as always.
 */

import type { BrandConfig, Market, Sample } from './types.js';

export interface CitationSource {
  market: Market;
  /** Hostname, lowercased, leading www. stripped. */
  domain: string;
  /** Total citation URLs pointing at this domain. */
  citations: number;
  /** Distinct samples citing it at least once. */
  samples: number;
  /** Engines that cited it. */
  engines: string[];
  /** True when the domain belongs to the brand (hostname-suffix match). */
  own: boolean;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isOwn(host: string, domains: string[]): boolean {
  return domains.some(d => {
    const dom = d.toLowerCase().replace(/^www\./, '');
    return host === dom || host.endsWith(`.${dom}`);
  });
}

export function analyzeCitationSources(samples: Sample[], brand: BrandConfig): CitationSource[] {
  interface Acc {
    market: Market;
    domain: string;
    citations: number;
    sampleKeys: Set<string>;
    engines: Set<string>;
  }
  const acc = new Map<string, Acc>();
  for (const [i, s] of samples.entries()) {
    if (s.brandInQuestion) continue; // probes are segregated here too
    for (const url of s.citations) {
      const host = hostnameOf(url);
      if (!host) continue;
      const key = `${s.market}|${host}`;
      const a = acc.get(key) ?? {
        market: s.market, domain: host, citations: 0, sampleKeys: new Set(), engines: new Set(),
      };
      a.citations++;
      a.sampleKeys.add(`${i}`);
      a.engines.add(s.providerId);
      acc.set(key, a);
    }
  }
  return [...acc.values()]
    .map(a => ({
      market: a.market,
      domain: a.domain,
      citations: a.citations,
      samples: a.sampleKeys.size,
      engines: [...a.engines].sort(),
      own: isOwn(a.domain, brand.domains),
    }))
    .sort((a, b) => a.market.localeCompare(b.market) || b.citations - a.citations || a.domain.localeCompare(b.domain));
}
