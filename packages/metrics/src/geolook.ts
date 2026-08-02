/**
 * GeoLook interoperability: parse GeoLook `samples/*.jsonl` rows into
 * normalized Samples so existing GeoLook projects can be re-scored by the
 * FasterGEO metrics engine (and the two implementations cross-checked).
 */

import type { Sample } from './types.js';

interface GeoLookRow {
  platform: string;
  market: 'cn' | 'global';
  question_id: string;
  question: string;
  brand_in_question?: boolean;
  ok?: boolean;
  answer?: string;
  citations?: string[];
  sample_mode?: string;
  terminal?: string;
}

/** Parse GeoLook JSONL content (one row per line). Skips failed samples. */
export function parseGeoLookSamples(jsonl: string): Sample[] {
  const samples: Sample[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: GeoLookRow;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (row.ok === false || !row.answer) continue;
    samples.push({
      providerId: row.platform,
      market: row.market,
      questionId: row.question_id,
      question: row.question,
      brandInQuestion: Boolean(row.brand_in_question),
      answer: row.answer,
      citations: row.citations ?? [],
      channel: row.sample_mode === 'api' ? 'api' : 'manual',
    });
  }
  return samples;
}
