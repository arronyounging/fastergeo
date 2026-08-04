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
import { renderHtmlReport, dailyContract } from '@fastergeo/report';
import { computeTrends } from '@fastergeo/trends';
import { PROVIDERS, resolveProvider } from '@fastergeo/providers';
import { rankTickets } from '@fastergeo/tickets';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJson(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function loadPeriods(dir) {
  const hist = join(dir, 'history');
  if (!existsSync(hist)) return [];
  const byDate = new Map();
  for (const f of readdirSync(hist)) {
    const m = /^(\d{4}-\d{2}-\d{2})-(metrics|audit|samples)\.json$/.exec(f);
    if (!m) continue;
    const rec = byDate.get(m[1]) ?? { date: m[1] };
    rec[m[2]] = loadJson(join(hist, f));
    byDate.set(m[1], rec);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every engine, with whether a key is configured — never whether it is valid,
 * and never the key itself.
 *
 * The unconfigured ones are listed by name on purpose. A row reading
 * "文心 · not configured" says more about China coverage than any claim on the
 * marketing site, and it keeps the dashboard honest: an engine we did not
 * sample renders as "—", never as a zero.
 */
function engineStatus() {
  return Object.values(PROVIDERS).map(spec => {
    const r = resolveProvider(spec.id);
    return {
      id: spec.id,
      name: spec.name,
      market: spec.market,
      driver: spec.driver,
      configured: spec.driver === 'api' ? Boolean(r.apiKey) : false,
      keyEnv: spec.keyEnv ?? null,
    };
  });
}

/** The five dossier documents, raw. The frontend renders them; we don't parse. */
function loadDossier(dir) {
  const d = join(dir, 'dossier');
  const files = ['product.md', 'facts.md', 'competitors.md', 'questions.md', 'voice.md'];
  const out = {};
  for (const f of files) {
    const p = join(d, f);
    out[f] = existsSync(p) ? readFileSync(p, 'utf8') : null;
  }
  return out;
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
        const latest = periods[periods.length - 1] ?? null;
        const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
        // Ranking and contract wording come from the packages, not from the
        // frontend — a second copy of either would drift from the CLI's.
        const ranked = rankTickets(loadJson(join(projectDir, 'tickets.json'), []));
        // samples can be MBs of verbatim answers and the frontend does not
        // read them from this endpoint — /api/report renders them instead.
        const { samples: _omit, ...latestLite } = latest ?? {};
        return send(200, {
          brand: loadJson(join(projectDir, 'brand.json'), {}),
          facts: loadJson(join(projectDir, 'facts.json')),
          tickets: loadJson(join(projectDir, 'tickets.json'), []),
          today: ranked.today,
          ticketCounts: ranked.counts,
          questions: loadJson(join(projectDir, 'questions.json'), []),
          periods: periods.map(p => p.date),
          latest: latest ? latestLite : null,
          engines: engineStatus(),
          dossier: loadDossier(projectDir),
          contract: dailyContract(lang),
          digest: existsSync(join(projectDir, 'today.md'))
            ? readFileSync(join(projectDir, 'today.md'), 'utf8') : null,
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
          samples: latest.samples ?? undefined,
          brandAliases: brand.aliases,
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
