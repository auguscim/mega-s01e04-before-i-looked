import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, Night, ReadNight, RunLine } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

// Parse one log line at the edge. Anything that isn't a well-formed run line is null.
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || Number.isNaN(Date.parse(o.at))) return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status as JobStatus)) return null;
  if (o.owner !== undefined && o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const run: RunLine = {
    at: o.at,
    job: o.job,
    status: o.status as JobStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
  };
  if (typeof o.error === 'string') run.error = o.error;
  return run;
}

export function digest(night: string, text: string): Night {
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const run = parseLine(raw);
    if (!run) {
      badLines++;
      continue;
    }
    counts[run.status]++;
    const list = byJob.get(run.job);
    if (list) list.push(run);
    else byJob.set(run.job, [run]);
  }

  const rows: DigestRow[] = [...byJob.entries()].map(([job, runs]) => {
    // Stable sort by instant; ties keep file order. `at` strings are kept as written.
    const sorted = [...runs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const lastWithError = [...sorted].reverse().find((r) => r.error !== undefined);
    const lastOwner = [...sorted].reverse().find((r) => r.owner !== null);
    return {
      job,
      owner: lastOwner?.owner ?? null,
      runs: sorted.length,
      retries: sorted.filter((r) => r.status === 'retry').length,
      lastStatus: last.status,
      lastError: lastWithError?.error ?? null,
      firstAt: first.at,
      lastAt: last.at,
    };
  });
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  return digest(night, text);
};
