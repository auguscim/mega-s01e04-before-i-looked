// Plan morning-digest § 1. The contract every part of § 2 starts against: the reader
// (src/digest/read.ts) implements `ReadNight`; the page, the JSON and the board only consume it.

export type JobStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset — never converted to UTC
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // last non-null owner seen for the job; null renders as `—`
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: JobStatus; // status of the job's latest line (by `at`)
  lastError: string | null; // error of the job's latest line that had one
  firstAt: string; // earliest `at`, as written in the log
  lastAt: string; // latest `at`, as written in the log
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; the page and the JSON use this order as is (ADR 0001)
  badLines: number; // lines that did not parse; counted, never thrown
  counts: Record<JobStatus, number>; // lines per status, for the board
};

// Reads runs/<night>.jsonl. Returns null when the night has no file (or `night` is not a
// YYYY-MM-DD date), so routes can answer 404. An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
