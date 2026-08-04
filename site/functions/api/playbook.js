/**
 * GET /api/playbook?skill=ai-seo[&section=…] — the how, next to the what.
 *
 * Our audit is precise about what is wrong and thin about what to do next: a
 * ticket says "add statistics blocks" and a non-specialist stalls there. This
 * serves the method — how to write the passage, what good looks like, what to
 * check afterwards — from the marketing skills suite.
 *
 * The bundle is built at deploy time by scripts/build-playbooks.mjs. Attribution
 * rides on every response rather than sitting in a licence file, so no surface
 * can render this content without it.
 */
import bundle from './_playbooks.js';

const JSON_H = {
  'Content-Type': 'application/json; charset=utf-8',
  // Static content, versioned by deploy. Long cache, no revalidation cost.
  'Cache-Control': 'public, max-age=86400',
};

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const skill = q.get('skill');
  const section = q.get('section');

  if (!skill) {
    // The index doubles as the answer to "what do you actually know about?"
    return new Response(JSON.stringify({
      attribution: bundle.attribution, license: bundle.license, source: bundle.source,
      skills: Object.entries(bundle.skills).map(([id, s]) => ({
        id, about: s.about, sections: s.sections.length,
      })),
    }), { headers: JSON_H });
  }

  const s = bundle.skills[skill];
  if (!s) {
    return new Response(JSON.stringify({ error: 'unknown playbook' }), { status: 404, headers: JSON_H });
  }
  if (section) {
    // Loose match: callers hold a heading we wrote down elsewhere, and headings
    // upstream get reworded between versions. A near miss should still land.
    const want = section.toLowerCase();
    const hit = s.sections.find(x => x.h.toLowerCase() === want)
      ?? s.sections.find(x => x.h.toLowerCase().includes(want))
      ?? s.sections.find(x => want.includes(x.h.toLowerCase()));
    if (hit) {
      return new Response(JSON.stringify({
        attribution: bundle.attribution, skill, about: s.about, section: hit,
      }), { headers: JSON_H });
    }
  }
  return new Response(JSON.stringify({
    attribution: bundle.attribution, skill, about: s.about, sections: s.sections,
  }), { headers: JSON_H });
}
