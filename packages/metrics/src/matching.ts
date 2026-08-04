/**
 * Brand/competitor mention matching.
 *
 * Latin names match on word boundaries (case-insensitive) so 'Custyle' does
 * not hit 'custylex'; CJK names match by plain substring (CJK has no word
 * boundaries). First-occurrence position drives rank ordering.
 */

const HAS_CJK = /[一-鿿぀-ゟ゠-ヿ가-힯]/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Index of the first occurrence of any name variant, or -1. */
export function firstMentionIndex(text: string, names: string[]): number {
  let best = -1;
  for (const raw of names) {
    // Same guard as matchRanges — metrics and display MUST share one spec,
    // or the replay could disagree with the numbers it exists to prove.
    const name = raw?.trim();
    if (!name || name.length < 2) continue;
    let idx = -1;
    if (HAS_CJK.test(name)) {
      idx = text.indexOf(name);
    } else {
      // \b fails around non-ASCII boundaries; (?<![\w-]) handles hyphenated runs
      const re = new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'i');
      const m = re.exec(text);
      idx = m ? m.index : -1;
    }
    if (idx >= 0 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

export function mentions(text: string, names: string[]): boolean {
  return firstMentionIndex(text, names) >= 0;
}

export interface MatchRange {
  start: number;
  end: number;
}

/**
 * All occurrences of any name variant, same boundary rules as
 * firstMentionIndex. This is the single matching truth: display layers
 * (answer replay highlighting) MUST use this, never their own substring
 * search, or the replay would contradict the metrics it exists to prove.
 */
export function matchRanges(text: string, names: string[]): MatchRange[] {
  const ranges: MatchRange[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name || name.length < 2) continue;
    if (HAS_CJK.test(name)) {
      let i = 0;
      while ((i = text.indexOf(name, i)) !== -1) {
        ranges.push({ start: i, end: i + name.length });
        i += name.length;
      }
    } else {
      const re = new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        ranges.push({ start: m.index, end: m.index + m[0].length });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
  }
  return ranges;
}

export interface RankedMention {
  name: string;
  index: number;
}

/**
 * Order all mentioned entities (brand + competitors) by first occurrence.
 * Returns the 1-based rank of the target brand, or null when not mentioned.
 */
export function brandRank(
  text: string,
  brandNames: string[],
  competitorNameSets: Array<{ name: string; names: string[] }>,
): { rank: number | null; mentioned: RankedMention[] } {
  const found: RankedMention[] = [];
  const brandIdx = firstMentionIndex(text, brandNames);
  if (brandIdx >= 0) found.push({ name: '__brand__', index: brandIdx });
  for (const c of competitorNameSets) {
    const idx = firstMentionIndex(text, c.names);
    if (idx >= 0) found.push({ name: c.name, index: idx });
  }
  found.sort((a, b) => a.index - b.index);
  const pos = found.findIndex(f => f.name === '__brand__');
  return { rank: pos >= 0 ? pos + 1 : null, mentioned: found };
}
