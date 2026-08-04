/**
 * POST /api/step {id} — advance a project by exactly one stage.
 *
 * The client drives the loop. A Worker cannot hold a request open for the two
 * minutes this work takes, and a background job would have nothing to show
 * while it ran. One stage per call keeps every request short, makes each stage
 * independently retryable, and hands back the lines it would have printed —
 * which is what makes the terminal real rather than a progress-bar animation
 * pretending to be one.
 */
import { runStage } from './_pipeline.js';
import { loadProject, saveProject } from './project.js';
import { kv } from './_store.js';

const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

export async function onRequestPost({ request, env }) {
  if (!kv(env)) {
    return new Response(JSON.stringify({ error: 'storage not configured' }), { status: 503, headers: JSON_H });
  }
  let body;
  try { body = await request.json(); } catch { body = null; }
  const p = await loadProject(env, body?.id);
  if (!p) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_H });
  if (p.stage === 'done') {
    return new Response(JSON.stringify({ done: true, stage: 'done', newLines: [] }), { headers: JSON_H });
  }

  const started = p.stage;
  const r = await runStage(p, env);
  // Saved even when the stage failed: runStage records the failure on the
  // project and moves on, and losing that record would mean repeating a step
  // that has already told us it cannot work.
  await saveProject(env, p);
  return new Response(JSON.stringify({
    ran: started, stage: p.stage, done: r.done, newLines: r.newLines ?? [],
  }), { headers: JSON_H });
}
