import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFastergeoServer } from '../src/server.js';

/** Real MCP round-trip over an in-memory transport — no mocks, no network. */
let client: Client;

beforeAll(async () => {
  const server = createFastergeoServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
});

const text = (r: Awaited<ReturnType<Client['callTool']>>): string =>
  (r.content as Array<{ type: string; text: string }>)[0].text;

describe('fastergeo MCP server', () => {
  it('exposes all 9 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      'audit_page', 'audit_site', 'check_ai_crawlers', 'check_fabrication',
      'compute_metrics', 'generate_tickets', 'list_engines', 'sample_engine',
      'verify_tickets',
    ]);
  });

  it('list_engines returns 18 engines with key presence booleans, never values', async () => {
    const engines = JSON.parse(text(await client.callTool({ name: 'list_engines', arguments: {} })));
    expect(engines).toHaveLength(18);
    expect(engines.filter((e: { market: string }) => e.market === 'cn')).toHaveLength(10);
    for (const e of engines) {
      expect(typeof e.configured).toBe('boolean');
      const dump = JSON.stringify(e);
      for (const [k, v] of Object.entries(process.env)) {
        if (k.endsWith('_API_KEY') && v && v.length > 8) expect(dump).not.toContain(v);
      }
    }
  });

  it('compute_metrics segregates probes and reports null as null', async () => {
    const samples = [
      { providerId: 'glm', market: 'cn', questionId: 'q1', question: '推荐定制平台', brandInQuestion: false, answer: '推荐 Printful。', citations: [] },
      { providerId: 'glm', market: 'cn', questionId: 'q2', question: 'Acme 是什么？', brandInQuestion: true, answer: '我没有相关信息。', citations: [] },
    ].map(s => JSON.stringify(s)).join('\n');
    const brand = { name: 'Acme', aliases: [], domains: ['acme.dev'], competitors: [{ name: 'Printful' }] };
    const report = JSON.parse(text(await client.callTool({
      name: 'compute_metrics', arguments: { samples, brand },
    })));
    const glm = report.platforms[0];
    expect(glm.samples).toBe(1);                    // probe excluded from visibility pool
    expect(glm.mentionRate).toBe(0);
    expect(glm.citationShare).toBeNull();           // 0 citations → null, not 0
    expect(glm.probe.recognition.unknown).toBe(1);  // denial heuristic, no judge needed
  });

  it('check_fabrication rejects unsourced numbers and passes clean drafts', async () => {
    const facts = JSON.stringify({
      brand: 'Acme', definition: 'Acme is a testing brand.',
      facts: [{ id: 'f1', claim: 'founded in 2020', grade: 'A', source: 'https://acme.dev/about', status: 'confirmed' }],
      doNotClaim: ['world-leading'],
    });
    const dirty = JSON.parse(text(await client.callTool({
      name: 'check_fabrication',
      arguments: { draft: 'Acme serves 87,000 customers.', facts },
    })));
    expect(dirty.pass).toBe(false);
    const clean = JSON.parse(text(await client.callTool({
      name: 'check_fabrication',
      arguments: { draft: 'Acme was founded in 2020.', facts },
    })));
    expect(clean.pass).toBe(true);
  });

  it('generate_tickets fails honestly with no inputs', async () => {
    const r = await client.callTool({ name: 'generate_tickets', arguments: {} });
    expect(r.isError).toBe(true);
  });

  it('returns actionable errors for malformed JSON params', async () => {
    const bad = await client.callTool({ name: 'verify_tickets', arguments: { tickets: '{not json' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('tickets');
    expect(text(bad)).toContain('not valid JSON');
    const notArray = await client.callTool({ name: 'verify_tickets', arguments: { tickets: '{"a":1}' } });
    expect(notArray.isError).toBe(true);
    expect(text(notArray)).toContain('array');
    const noFacts = await client.callTool({ name: 'check_fabrication', arguments: { draft: 'x', facts: '{}' } });
    expect(noFacts.isError).toBe(true);
    expect(text(noFacts)).toContain('facts');
  });

  it('rejects non-http url schemes by name in audits', async () => {
    const r = await client.callTool({
      name: 'audit_site',
      arguments: { root: 'https://example.com', urls: ['javascript:alert(1)'] },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('unsupported scheme');
  });
});
