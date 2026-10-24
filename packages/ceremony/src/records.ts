// Decisions and signatures as they travel with the code: one JSON object per line in the target's
// `.rama/decisions.jsonl` and `.rama/signoffs.jsonl` (append-only, like their Postgres tables).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Decision, Signoff } from '@rama/shared';

export const DECISIONS_FILE = '.rama/decisions.jsonl';
export const SIGNOFFS_FILE = '.rama/signoffs.jsonl';

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'an ISO 8601 time');

export const DecisionRecord = z
  .object({
    id: z.string().min(1),
    siteId: z.string().min(1),
    title: z.string().min(1),
    statement: z.string().min(1),
    bricks: z.array(z.string()),
    screenId: z.string().min(1).optional(),
    status: z.enum(['decided', 'open', 'not-built']),
    by: z.string().min(1),
    at: iso,
    sessionId: z.string().min(1).optional(),
    reconstructed: z.boolean().optional(),
    supersedes: z.string().min(1).optional(),
  })
  .strict();

export const SignoffRecord = z
  .object({
    id: z.string().min(1),
    siteId: z.string().min(1),
    person: z.string().min(1),
    target: z
      .object({
        kind: z.enum(['screen', 'brick']),
        id: z.string().min(1),
        commit: z.string().min(7),
      })
      .strict(),
    statement: z.string().min(1),
    at: iso,
    supersedes: z.string().min(1).optional(),
    withdrawn: z.boolean().optional(),
    seal: z.string().min(1).optional(),
  })
  .strict();

/** One line: keys in a fixed order, so the same record is always the same bytes. */
export function line(record: Decision | Signoff): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
              .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sorted(record));
}

/** Parses a .jsonl text; a line that does not match the schema is an error with its number. */
export function parseLines<T>(text: string, schema: z.ZodType<T>, file: string): T[] {
  return text
    .split('\n')
    .map((l, i) => [l.trim(), i + 1] as const)
    .filter(([l]) => l !== '')
    .map(([l, n]) => {
      let json: unknown;
      try {
        json = JSON.parse(l);
      } catch {
        throw new Error(`${file}:${n} is not JSON`);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success)
        throw new Error(`${file}:${n} does not match its schema: ${parsed.error.message}`);
      return parsed.data;
    });
}

export const readDecisions = (repoDir: string): Decision[] =>
  readFile(repoDir, DECISIONS_FILE, DecisionRecord);
export const readSignoffs = (repoDir: string): Signoff[] =>
  readFile(repoDir, SIGNOFFS_FILE, SignoffRecord);

function readFile<T>(repoDir: string, file: string, schema: z.ZodType<T>): T[] {
  const full = path.join(repoDir, file);
  return existsSync(full) ? parseLines(readFileSync(full, 'utf8'), schema, file) : [];
}

/** Appends one record to a .jsonl file, creating it (and `.rama/`) when needed. */
export function appendRecord(repoDir: string, file: string, record: Decision | Signoff): void {
  const full = path.join(repoDir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  const text = existsSync(full) ? readFileSync(full, 'utf8') : '';
  appendFileSync(full, (text && !text.endsWith('\n') ? '\n' : '') + line(record) + '\n');
}

/**
 * Brings a mirror up to the committed rows, append-only: every row (in the order given) whose id has no
 * line yet is appended. A line is never removed or rewritten. Returns how many were appended.
 */
export function syncMirror(repoDir: string, file: string, rows: (Decision | Signoff)[]): number {
  const full = path.join(repoDir, file);
  const present = new Set(
    (existsSync(full) ? readFileSync(full, 'utf8') : '')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => (JSON.parse(l) as { id?: string }).id),
  );
  const missing = rows.filter((r) => !present.has(r.id));
  for (const r of missing) appendRecord(repoDir, file, r);
  return missing.length;
}

/**
 * The signatures in force: a signature superseded by a later one is replaced (or, when the later one is
 * a withdrawal, the target is unsigned). Keyed by `<kind>:<id>`; each value is the latest signature of
 * the chain, or absent when the chain ends in a withdrawal.
 */
export function signaturesInForce(all: Signoff[]): Map<string, Signoff> {
  const superseded = new Set(all.map((s) => s.supersedes).filter((x): x is string => Boolean(x)));
  const out = new Map<string, Signoff>();
  for (const s of [...all].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (superseded.has(s.id)) continue;
    const key = `${s.target.kind}:${s.target.id}`;
    if (s.withdrawn) out.delete(key);
    else out.set(key, s);
  }
  return out;
}

/**
 * Refuses a signature that would break the chain: it must supersede a signature of the same target that
 * nothing has superseded yet, a withdrawal must supersede something, and an id may appear once.
 */
export function checkChain(existing: Signoff[], next: Signoff): void {
  if (existing.some((s) => s.id === next.id))
    throw new ChainError(`signoff ${next.id} already exists`);
  if (next.withdrawn && !next.supersedes)
    throw new ChainError('a withdrawal must say which signature it withdraws');
  if (!next.supersedes) return;
  const prior = existing.find((s) => s.id === next.supersedes);
  if (!prior) throw new ChainError(`signoff ${next.supersedes} does not exist`);
  if (prior.target.kind !== next.target.kind || prior.target.id !== next.target.id) {
    throw new ChainError('a signature can only supersede one of the same screen or brick');
  }
  if (existing.some((s) => s.supersedes === prior.id))
    throw new ChainError(`signoff ${prior.id} is already superseded`);
}

export class ChainError extends Error {
  override name = 'ChainError';
}
