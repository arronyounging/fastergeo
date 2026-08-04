/**
 * Alias suggestion — candidates only, never auto-added.
 *
 * Missing aliases are the quietest way to under-count visibility: the answer
 * says "custyle.ai" and the brand config only knows "Custyle". These
 * deterministic candidates surface at bootstrap time; a human adds them to
 * brand.json (aliases are the disambiguation bedrock — additions are a
 * judgment call, especially for CJK where substring matching applies).
 */

export interface AliasCandidate {
  alias: string;
  reason: string;
}

export function suggestAliases(brand: {
  name: string;
  domains?: string[];
  aliases?: string[];
}): AliasCandidate[] {
  const have = new Set(
    [brand.name, ...(brand.aliases ?? [])].map(a => a.trim().toLowerCase()).filter(Boolean),
  );
  const out: AliasCandidate[] = [];
  const propose = (alias: string, reason: string): void => {
    const key = alias.trim().toLowerCase();
    if (!key || key.length < 2 || have.has(key)) return;
    have.add(key);
    out.push({ alias: alias.trim(), reason });
  };

  for (const d of brand.domains ?? []) {
    const host = d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!host) continue;
    propose(host, 'own domain — answers often name the site, not the brand');
    const label = host.split('.')[0];
    propose(label, 'domain label');
  }

  const words = brand.name.trim().split(/\s+/);
  if (words.length >= 2) {
    propose(words.join(''), 'name without spaces');
    propose(words.join('-'), 'hyphenated name');
    const acronym = words.map(w => w[0]).join('');
    if (acronym.length >= 2 && /^[A-Za-z]+$/.test(acronym)) {
      propose(acronym.toUpperCase(), 'acronym — verify it is not someone else\'s');
    }
  }
  return out;
}
