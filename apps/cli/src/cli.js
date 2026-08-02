#!/usr/bin/env node
/**
 * fastergeo — GEO platform CLI (minimal loop: check / sample / metrics)
 *
 *   fastergeo check [--providers a,b]          engine key health checks
 *   fastergeo sample --question "..." [--providers a,b] [--market cn|global]
 *   fastergeo metrics --samples f.jsonl --brand brand.json [--format geolook]
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import {
  PROVIDERS, resolveProvider, configuredProviders, ask, checkProvider,
} from '@fastergeo/providers';
import { computeMetrics, parseGeoLookSamples, makeLlmJudge } from '@fastergeo/metrics';

const [, , command, ...rest] = process.argv;

const { values: flags } = parseArgs({
  args: rest,
  options: {
    providers: { type: 'string' },
    question: { type: 'string' },
    market: { type: 'string' },
    samples: { type: 'string' },
    brand: { type: 'string' },
    format: { type: 'string' },
    judge: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const ICONS = {
  ok: '✓', 'no-key': '·', 'manual-driver': '◇',
  'auth-failed': '✗', 'model-unavailable': '✗', 'network-error': '✗', 'http-error': '✗',
};

async function cmdCheck() {
  const ids = flags.providers ? flags.providers.split(',') : Object.keys(PROVIDERS);
  const reports = await Promise.all(
    ids.map(id => checkProvider(resolveProvider(id))),
  );
  for (const r of reports) {
    const spec = PROVIDERS[r.providerId];
    const line = [
      ICONS[r.status] ?? '?',
      r.providerId.padEnd(12),
      `[${spec.market}]`,
      r.status.padEnd(17),
      r.latencyMs ? `${r.latencyMs}ms` : '',
    ].join(' ');
    console.log(line);
    if (r.hint) console.log(`    ↳ ${r.hint}`);
  }
  const ok = reports.filter(r => r.status === 'ok').length;
  const manual = reports.filter(r => r.status === 'manual-driver').length;
  console.log(`\n${ok} 可自动采样 · ${manual} 人工采样表 · ${reports.length - ok - manual} 待配置/异常`);
}

async function cmdSample() {
  if (!flags.question) {
    console.error('用法: fastergeo sample --question "..." [--providers a,b] [--market cn|global]');
    process.exit(1);
  }
  let targets = flags.providers
    ? flags.providers.split(',').map(id => resolveProvider(id))
    : configuredProviders();
  if (flags.market) targets = targets.filter(p => p.market === flags.market);
  if (targets.length === 0) {
    console.error('没有可用引擎：检查 --providers 或环境变量里的 API Key（fastergeo check 可诊断）。');
    process.exit(1);
  }
  const results = await Promise.allSettled(
    targets.map(p => ask(p, { question: flags.question })),
  );
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      const s = r.value;
      if (flags.json) {
        console.log(JSON.stringify(s));
      } else {
        console.log(`\n── ${s.providerId} (${s.model}, ${s.channel}, ${s.latencyMs}ms) ──`);
        console.log(s.answer.slice(0, 800));
        if (s.citations.length) console.log('citations:', s.citations.join(' '));
      }
    } else {
      console.error(`✗ ${targets[i].id}: ${r.reason?.message ?? r.reason}`);
    }
  }
}

async function cmdMetrics() {
  if (!flags.samples || !flags.brand) {
    console.error('用法: fastergeo metrics --samples f.jsonl --brand brand.json [--format geolook] [--judge glm] [--json]');
    process.exit(1);
  }
  const brand = JSON.parse(readFileSync(flags.brand, 'utf8'));
  const raw = readFileSync(flags.samples, 'utf8');
  const samples = flags.format === 'geolook'
    ? parseGeoLookSamples(raw)
    : raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
  // --judge <providerId>: LLM 裁判判定点名题的认知质量（knows/confused），
  // 不配则启发式判不了的保持 unverified，绝不猜测。
  let judge;
  if (flags.judge) {
    const jp = resolveProvider(flags.judge);
    judge = makeLlmJudge(async prompt =>
      (await ask(jp, { question: prompt, maxTokens: 500 })).answer);
  }
  const report = await computeMetrics(samples, brand, {
    judge,
    brandDescription: brand.description,
  });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const pct = v => (v === null ? '未测' : `${(v * 100).toFixed(0)}%`);
  console.log(`brand: ${report.brand} · samples: ${report.totalSamples}\n`);
  for (const p of report.platforms) {
    console.log(`${p.providerId.padEnd(12)} [${p.market}] 提及率 ${pct(p.mentionRate)} · Top3 ${pct(p.top3Rate)} · SoV ${pct(p.shareOfVoice)} · 官网引用 ${pct(p.ownDomainCiteRate)}`);
    const comps = Object.entries(p.competitorMentions).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}×${n}`).join(', ');
    if (comps) console.log(`             竞品: ${comps}`);
    if (p.probe) {
      const rec = Object.entries(p.probe.recognition).filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}×${n}`).join(' ');
      console.log(`             点名认知(${p.probe.samples}题): ${rec}`);
      for (const e of p.probe.confusedEvidence) console.log(`             ⚠ 张冠李戴证据: ${e.slice(0, 80)}`);
    }
  }
}

const commands = { check: cmdCheck, sample: cmdSample, metrics: cmdMetrics };
const run = commands[command];
if (!run) {
  console.log('fastergeo <check|sample|metrics> — 用法见各命令 --help 或源码头部注释');
  process.exit(command ? 1 : 0);
}
run().catch(err => {
  console.error('fastergeo failed:', err.message ?? err);
  process.exit(1);
});
