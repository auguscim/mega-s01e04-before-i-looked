import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

// Plan morning-digest § 2d. Routes under test: GET /digest/:night (HTML) and GET /api/digest/:night
// (JSON). The JSON body must equal readNight(runsDir, night) exactly, and the page must list the
// same jobs in the same order as the JSON.

const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));

const normal = [
  '{"at":"2026-11-01T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-11-01T02:00:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-11-01T02:01:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '',
].join('\n');

const withBadLine = [
  '{"at":"2026-11-02T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  'not json at all',
  '{"at":"2026-11-02T04:00:01+01:00","job":"notes/backup","status":"fail","owner":null,"error":"quota exceeded"}',
  '',
].join('\n');

writeFileSync(join(runsDir, '2026-11-01.jsonl'), normal);
writeFileSync(join(runsDir, '2026-11-02.jsonl'), withBadLine);
writeFileSync(join(runsDir, '2026-11-03.jsonl'), '');
// 2026-11-09 has no file on purpose.

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

describe('digest routes', () => {
  const app = createApp(config);

  beforeAll(() => {
    // Sanity: the fixtures are what the cases below assume.
    expect(readNight(runsDir, '2026-11-01')?.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync']);
  });

  describe('a normal night with 2 jobs', () => {
    it('page 200 shows both job names', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('fixtures/refresh');
      expect(html).toContain('lane/sync');
    });

    it('JSON 200 equals readNight, rows in job order', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body).toEqual(readNight(runsDir, '2026-11-01'));
      expect(body.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync']);
    });

    it('page and JSON list the jobs in the same order', async () => {
      const html = await (await app.request('/digest/2026-11-01')).text();
      const jsonRes = await app.request('/api/digest/2026-11-01');
      expect(jsonRes.status).toBe(200);
      const body = (await jsonRes.json()) as Night;
      const positions = body.rows.map((r) => html.indexOf(r.job));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });
  });

  describe('a night with no file', () => {
    it('page 404', async () => {
      const res = await app.request('/digest/2026-11-09');
      expect(res.status).toBe(404);
    });

    it('JSON 404', async () => {
      const res = await app.request('/api/digest/2026-11-09');
      expect(res.status).toBe(404);
    });
  });

  describe('an empty file', () => {
    it('page says "nothing ran"', async () => {
      const res = await app.request('/digest/2026-11-03');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('nothing ran');
    });

    it('JSON has rows []', async () => {
      const res = await app.request('/api/digest/2026-11-03');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body.rows).toEqual([]);
      expect(body).toEqual(readNight(runsDir, '2026-11-03'));
    });
  });

  describe('a night with one bad line plus good lines', () => {
    it('page 200 still shows the good jobs', async () => {
      const res = await app.request('/digest/2026-11-02');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('lane/sync');
      expect(html).toContain('notes/backup');
    });

    it('JSON 200 counts the bad line and keeps the good rows', async () => {
      const res = await app.request('/api/digest/2026-11-02');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body.badLines).toBe(1);
      expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
      expect(body).toEqual(readNight(runsDir, '2026-11-02'));
    });

    it('page and JSON list the jobs in the same order', async () => {
      const html = await (await app.request('/digest/2026-11-02')).text();
      const jsonRes = await app.request('/api/digest/2026-11-02');
      expect(jsonRes.status).toBe(200);
      const body = (await jsonRes.json()) as Night;
      const positions = body.rows.map((r) => html.indexOf(r.job));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });
  });
});
