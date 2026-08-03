/**
 * Log line parsing: nginx/apache "combined" format and Cloudflare Logpush
 * JSON lines. Lines that don't parse are counted, never guessed at —
 * a report that silently drops 40% of its input is lying by omission.
 */

export interface LogEntry {
  time: Date | null;
  method: string;
  path: string;
  status: number;
  ua: string;
  referer: string;
}

export type LogFormat = 'combined' | 'cloudflare' | 'auto';

// 1.2.3.4 - - [10/Aug/2026:13:55:36 +0000] "GET /path HTTP/1.1" 200 5316 "referer" "ua"
const COMBINED_RE =
  /^\S+ \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"/;

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseClfDate(raw: string): Date | null {
  // 10/Aug/2026:13:55:36 +0000
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/.exec(raw);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  const offsetMin = (Number(m[7].slice(0, 3)) * 60 + Number(m[7][0] + m[7].slice(3))) || 0;
  const utc = Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  return new Date(utc - offsetMin * 60_000);
}

function parseCombined(line: string): LogEntry | null {
  const m = COMBINED_RE.exec(line);
  if (!m) return null;
  return {
    time: parseClfDate(m[1]),
    method: m[2],
    path: m[3],
    status: Number(m[4]),
    referer: m[5] === '-' ? '' : m[5],
    ua: m[6],
  };
}

/** Cloudflare Logpush field names, plus generic fallbacks. */
function parseCloudflare(line: string): LogEntry | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const path = str(j.ClientRequestURI) || str(j.ClientRequestPath) || str(j.path) || str(j.url);
  const ua = str(j.ClientRequestUserAgent) || str(j.ua) || str(j.userAgent);
  if (!path || !ua) return null;
  const status = Number(j.EdgeResponseStatus ?? j.OriginResponseStatus ?? j.status ?? NaN);
  const ts = j.EdgeStartTimestamp ?? j.timestamp ?? j.time;
  let time: Date | null = null;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    time = Number.isNaN(d.getTime()) ? null : d;
  } else if (typeof ts === 'number') {
    // Logpush emits ns or ms epoch depending on config
    time = new Date(ts > 1e14 ? ts / 1e6 : ts);
  }
  return {
    time,
    method: str(j.ClientRequestMethod) || str(j.method) || 'GET',
    path,
    status: Number.isNaN(status) ? 0 : status,
    referer: str(j.ClientRequestReferer) || str(j.referer) || '',
    ua,
  };
}

export function parseLogLine(line: string, format: LogFormat = 'auto'): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (format === 'combined') return parseCombined(trimmed);
  if (format === 'cloudflare') return parseCloudflare(trimmed);
  return trimmed.startsWith('{') ? parseCloudflare(trimmed) : parseCombined(trimmed);
}
