/**
 * The one shape of "someone asked us to watch this", for both kinds of record.
 *
 * A project and a one-page scan live under different keys with different savers,
 * and every endpoint that touches a watcher needs both. Kept here so unsubscribe
 * and confirmation cannot disagree about what a watched record is.
 */
import { loadScan, saveWatchedScan } from './_store.js';
import { loadProject, saveProject } from './project.js';

/** @returns {{rec: object, kind: 'p'|'r'}|null} */
export async function loadWatched(env, id) {
  const proj = await loadProject(env, id);
  if (proj) return { rec: proj, kind: 'p' };
  const scan = await loadScan(env, id);
  return scan ? { rec: scan, kind: 'r' } : null;
}

export const saveWatched = (env, { rec, kind }) =>
  (kind === 'p' ? saveProject(env, rec) : saveWatchedScan(env, rec));

export const page = (body, zh) => `<!DOCTYPE html><html lang="${zh ? 'zh' : 'en'}"><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">`
  + `<title>FasterGEO</title></head><body style="font:16px/1.6 Georgia,serif;color:#1C1A15;background:#F6F3EC;`
  + `max-width:520px;margin:12vh auto;padding:0 20px">${body}</body></html>`;

export const HTML_H = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
