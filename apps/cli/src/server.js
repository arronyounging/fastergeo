/**
 * fastergeo ui — local dashboard server.
 * Binds 127.0.0.1 only (deliberate security boundary: no auth system, so no
 * remote exposure; use an SSH tunnel for remote access). Zero dependencies:
 * node:http + a single-file frontend.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtmlReport } from '@fastergeo/report';
import { computeTrends } from '@fastergeo/trends';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJson(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function loadPeriods(dir) {
  const hist = join(dir, 'history');
  if (!existsSync(hist)) return [];
  const byDate = new Map();
  for (const f of readdirSync(hist)) {
    const m = /^(\d{4}-\d{2}-\d{2})-(metrics|audit)\.json$/.exec(f);
    if (!m) continue;
    const rec = byDate.get(m[1]) ?? { date: m[1] };
    rec[m[2]] = loadJson(join(hist, f));
    byDate.set(m[1], rec);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function startUi(projectDir, port = 8765) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };

    try {
      if (url.pathname === '/') {
        return send(200, readFileSync(join(__dirname, 'ui.html'), 'utf8'), 'text/html');
      }

      if (url.pathname === '/api/project') {
        const periods = loadPeriods(projectDir);
        return send(200, {
          brand: loadJson(join(projectDir, 'brand.json'), {}),
          facts: loadJson(join(projectDir, 'facts.json')),
          tickets: loadJson(join(projectDir, 'tickets.json'), []),
          periods: periods.map(p => p.date),
          latest: periods[periods.length - 1] ?? null,
        });
      }

      if (url.pathname === '/api/report') {
        const periods = loadPeriods(projectDir);
        const latest = periods[periods.length - 1];
        const brand = loadJson(join(projectDir, 'brand.json'), {});
        if (!latest) return send(200, '<p style="color:#8b97a8;font-family:sans-serif">No data yet — run a period first: fastergeo cycle --dir &lt;project&gt;</p>', 'text/html');
        const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
        return send(200, renderHtmlReport({
          lang,
          brandName: brand.name ?? 'Brand',
          audit: latest.audit ?? undefined,
          metrics: latest.metrics ?? undefined,
          tickets: loadJson(join(projectDir, 'tickets.json'), []),
        }), 'text/html');
      }

      if (url.pathname === '/api/trends') {
        const periods = loadPeriods(projectDir);
        const tlang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
        return send(200, periods.length >= 1 ? computeTrends(periods, tlang) : { periods: [], deltas: [], alerts: [] });
      }

      if (url.pathname === '/api/ticket' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const { id, status, note } = JSON.parse(body);
            const path = join(projectDir, 'tickets.json');
            const tickets = loadJson(path, []);
            const t = tickets.find(x => x.id === id);
            if (!t) return send(404, { error: 'ticket not found' });
            // 手动只允许操作人工验收类与待人工项；自动验收工单由 verify 判定
            t.history.push({ at: new Date().toISOString(), from: t.status, to: status, note: note ?? '手动标记（看板）' });
            t.status = status;
            writeFileSync(path, JSON.stringify(tickets, null, 2));
            send(200, { ok: true });
          } catch (err) {
            send(400, { error: String(err?.message ?? err) });
          }
        });
        return;
      }

      send(404, { error: 'not found' });
    } catch (err) {
      send(500, { error: String(err?.message ?? err) });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`FasterGEO dashboard: http://127.0.0.1:${port}  (project: ${projectDir})`);
    console.log('Bound to localhost only; use an SSH tunnel for remote access. Ctrl+C to quit.');
  });
  return server;
}
