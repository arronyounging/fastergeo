/**
 * Manual sampling sheets — the zero-API-key path.
 *
 * Engines without a public API (纳米AI, 百度AI, ChatGPT web, Doubao app…)
 * are sampled by a human pasting answers into a Markdown sheet, which
 * imports back into the exact same Sample shape as API sampling — one
 * metric pipeline, two acquisition modes.
 *
 * Format is designed for tolerant round-tripping: parsing keys off
 * structural markers (## 引擎:, ### qID, 答：, 引用：) and survives extra
 * whitespace, reordering, and unanswered blocks (skipped, not errored).
 */

import type { Market, Sample } from './types.js';

export interface SheetQuestion {
  id: string;
  group: string;
  market: Market | 'both';
  text: string;
  brandInQuestion?: boolean;
}

export interface SheetEngine {
  id: string;
  name: string;
  market: Market;
}

const PLACEHOLDER = '（把 AI 的完整回答粘贴到这里）';

export function renderSampleSheet(
  questions: SheetQuestion[],
  engines: SheetEngine[],
  brand: string,
  date = new Date().toISOString().slice(0, 10),
): string {
  const out: string[] = [
    `# FasterGEO 人工采样表 · ${brand} · ${date}`,
    '',
    '操作说明：',
    '1. 在对应引擎的网页/App 中逐题提问（新会话提问，不要连续追问）。',
    '2. 将 AI 的完整回答粘贴到「答：」下方，替换占位行。',
    '3. 引擎如显示了来源链接，粘贴到「引用：」下方，每行一个 URL。',
    '4. 不要修改以 ## 和 ### 开头的行。没采的题留空即可，导入时自动跳过。',
    '',
  ];
  for (const engine of engines) {
    const qs = questions.filter(q => q.market === engine.market || q.market === 'both');
    if (qs.length === 0) continue;
    out.push(`## 引擎: ${engine.id} (${engine.name}) · 市场: ${engine.market}`, '');
    for (const q of qs) {
      out.push(
        `### ${q.id} · ${q.group}`,
        `Q: ${q.text}`,
        '',
        '答：',
        PLACEHOLDER,
        '',
        '引用：',
        '',
      );
    }
  }
  return out.join('\n');
}

/** Result of importing a sheet: parsed samples + what was skipped and why. */
export interface SheetImport {
  samples: Sample[];
  skipped: Array<{ engine: string; questionId: string; reason: string }>;
}

export function parseSampleSheet(md: string): SheetImport {
  const samples: Sample[] = [];
  const skipped: SheetImport['skipped'] = [];

  const engineChunks = md.split(/^##\s*引擎[:：]\s*/m).slice(1);
  for (const chunk of engineChunks) {
    const headerMatch = /^(\S+?)\s*(?:\(([^)]*)\))?\s*·\s*市场[:：]\s*(cn|global)/.exec(chunk);
    if (!headerMatch) continue;
    const engineId = headerMatch[1];
    const market = headerMatch[3] as Market;

    const qChunks = chunk.split(/^###\s+/m).slice(1);
    for (const qc of qChunks) {
      const idMatch = /^(\S+)\s*·\s*(\S*)/.exec(qc);
      if (!idMatch) continue;
      const questionId = idMatch[1];
      const qText = /^Q[:：]\s*(.+)$/m.exec(qc)?.[1]?.trim() ?? '';

      const ansMatch = /答[:：]\s*\n([\s\S]*?)(?=\n引用[:：]|\n###\s|\n##\s|$)/.exec(qc);
      let answer = (ansMatch?.[1] ?? '').trim();
      if (answer.includes(PLACEHOLDER)) {
        answer = answer.replace(PLACEHOLDER, '').trim();
      }
      if (!answer) {
        skipped.push({ engine: engineId, questionId, reason: '未填写回答' });
        continue;
      }
      if (answer.length < 20) {
        skipped.push({ engine: engineId, questionId, reason: `回答过短（${answer.length} 字符），疑似未采完整` });
        continue;
      }

      const citeMatch = /引用[:：]\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/.exec(qc);
      const citations = (citeMatch?.[1] ?? '')
        .split('\n')
        .map(l => l.trim().replace(/^[-*]\s*/, ''))
        .filter(l => /^https?:\/\//.test(l));

      samples.push({
        providerId: engineId,
        market,
        questionId,
        question: qText,
        // Probe flag is re-derived at metrics time via the question bank;
        // heuristic here: question text contains no way to know — caller
        // should pass a question bank to enrich. Kept false-safe below.
        brandInQuestion: false,
        answer,
        citations,
        channel: 'manual',
      });
    }
  }
  return { samples, skipped };
}

/**
 * Enrich imported samples with probe flags from the question bank —
 * the sheet itself is not trusted to carry metric semantics.
 */
export function enrichWithQuestionBank(
  imported: SheetImport,
  questions: SheetQuestion[],
): SheetImport {
  const probeIds = new Set(questions.filter(q => q.brandInQuestion).map(q => q.id));
  return {
    ...imported,
    samples: imported.samples.map(s => ({
      ...s,
      brandInQuestion: probeIds.has(s.questionId),
    })),
  };
}
