/**
 * Findings → playbooks.
 *
 * A ticket that says "add statistics blocks" tells someone what is missing and
 * leaves them to work out how. That gap is where our product has been thinnest:
 * the audit is precise, the fix is a sentence, and a non-specialist stalls.
 *
 * The marketing skills suite (coreyhaines31/marketingskills, MIT) is 21k lines
 * of exactly that missing half — how to write the thing, what good looks like,
 * what to check afterwards. This maps our machine findings onto it.
 *
 * Attribution is not optional politeness: the suite is MIT, which permits this
 * use and requires the notice. Every surface that renders a playbook carries it.
 *
 * The mapping is deliberately conservative. A finding routes to a playbook only
 * where the playbook genuinely covers it — a wrong pointer costs more than an
 * absent one, because a reader who follows it and finds nothing relevant stops
 * trusting the rest.
 */

export interface Playbook {
  /** Skill directory name in the installed suite. */
  skill: string;
  /** What that skill covers, in our words, for a non-specialist. */
  covers: string;
  /** The section worth reading first, when the skill is long. */
  start?: string;
  /**
   * The adjacent playbook people confuse this with. Borrowed from the suite's
   * own "For X, see Y" convention, which is what keeps 71 overlapping documents
   * navigable — and is exactly what a queue of eight tickets needs.
   */
  notThis?: string;
}

export const ATTRIBUTION = 'Playbooks from the marketing skills suite by Corey Haines (MIT licensed).';

/**
 * Keyed by the issue codes our audit emits and the ticket kinds we generate.
 * Order matters: the first match wins, so specific codes precede general ones.
 */
const MAP: Array<{ match: RegExp; play: Playbook }> = [
  {
    match: /block-gap:(statistics|definition|comparison|steps|faq)|answer-below-fold|context-dependent/,
    play: {
      skill: 'ai-seo',
      covers: 'How to write passages an AI will lift: definitions that stand alone, statistics with sources, comparisons, and Q&A — plus where on the page they have to sit.',
      start: 'Content Extractability Check',
      notThis: 'This is about being quotable. If nothing can reach the page at all, fix crawling first.',
    },
  },
  {
    match: /spa-shell|render|noindex|robots|crawler|sitemap|llms\.txt/,
    play: {
      skill: 'seo-audit',
      covers: 'The technical layer: what has to be true before any content work matters — rendering, indexability, crawler access, site files.',
      notThis: 'This is about access. Once crawlers can read you, quotability is a separate job.',
    },
  },
  {
    match: /entity|organization|sameAs|schema|json-?ld/i,
    play: {
      skill: 'schema',
      covers: 'Structured data: how to declare who you are so engines stop guessing from your name alone.',
      notThis: 'Schema tells machines what you are. Whether anyone vouches for you is a separate problem.',
    },
  },
  {
    match: /thin|content-short|word.?count|length/,
    play: {
      skill: 'content-strategy',
      covers: 'What to write and why: choosing topics from real demand rather than filling a page to hit a word count.',
      notThis: 'This decides what to write. How to phrase it for citation is the AI SEO playbook.',
    },
  },
  {
    match: /mention.?rate|share.?of.?voice|citation|off-?site|earned/i,
    play: {
      skill: 'competitors',
      covers: 'Comparison and alternative pages — the format buyers search for and AI engines quote when someone asks "X vs Y".',
      notThis: 'This earns you mentions elsewhere. Fixing your own pages is upstream of it.',
    },
  },
  {
    match: /title|meta.?description|heading|h1/i,
    play: {
      skill: 'copywriting',
      covers: 'Writing the line that decides whether anyone clicks — and how to say what you do without marketing filler.',
      notThis: 'This is about the words. Whether the page converts once read is CRO.',
    },
  },
];

export function playbookFor(ticket: { id?: string; title?: string; acceptance?: { check?: string } }): Playbook | null {
  const hay = [ticket.acceptance?.check, ticket.title, ticket.id].filter(Boolean).join(' ');
  if (!hay) return null;
  return MAP.find(m => m.match.test(hay))?.play ?? null;
}

/**
 * The playbooks worth reading for a whole project rather than one ticket —
 * what a growth lead would work through in order.
 *
 * Returned as a sequence because the ordering is the advice: there is no point
 * writing quotable content on a page AI cannot fetch, and no point chasing
 * off-site mentions before your own pages say what you do.
 */
export function projectPlaybooks(signals: {
  hasBlockers?: boolean;
  weakBlocks?: boolean;
  noEntity?: boolean;
  lowMention?: boolean;
}): Playbook[] {
  const out: Playbook[] = [];
  if (signals.hasBlockers) out.push(MAP[1].play);
  if (signals.noEntity) out.push(MAP[2].play);
  if (signals.weakBlocks) out.push(MAP[0].play);
  if (signals.lowMention) out.push(MAP[4].play);
  return out;
}
