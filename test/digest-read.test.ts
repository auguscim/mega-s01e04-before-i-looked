import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('has 5 jobs and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('counts runs and retries, keeps the last status and error', () => {
    const f = night.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(f).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', owner: 'rook' });
    expect(f.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(f.lastAt).toBe('2026-10-29T01:37:00+01:00');

    const sync = night.rows.find((r) => r.job === 'lane/sync')!;
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });

    const backup = night.rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a row whose owner is null', () => {
    const d = night.rows.find((r) => r.job === 'digest/render')!;
    expect(d.owner).toBeNull();
    expect(d.lastError).toBeNull();
  });

  it('counts lines per status', () => {
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), '');
  writeFileSync(join(dir, '2026-01-02.jsonl'), 'not json\n{"at":"x","job":"a","status":"ok"}\n');

  it('returns null for a night with no file or a bad name', () => {
    expect(readNight(dir, '2026-01-09')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts bad lines instead of throwing', () => {
    expect(readNight(dir, '2026-01-02')).toMatchObject({ rows: [], badLines: 2 });
  });
});
