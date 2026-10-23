// The House of Rama data model. Every table carries site_id, created_at and created_by (Invariant 8);
// site_id is nullable only on people. created_by is a person id or `rama:<component>@<version>`.
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const provenance = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
};

/** Members and reviewers. Until Stage 6 there is one: the local member. */
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').references((): AnyPgColumn => sites.siteId),
  name: text('name').notNull().unique(),
  ...provenance,
});

/** One row per target repository. The row's own id is its site_id. */
export const sites = pgTable('sites', {
  siteId: text('site_id').primaryKey(),
  name: text('name').notNull(),
  repo: text('repo'),
  memberId: uuid('member_id')
    .notNull()
    .references((): AnyPgColumn => people.id),
  ...provenance,
});

/** One row per external model call made through packages/model (rule 8). Append-only. */
export const modelCalls = pgTable('model_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  prompt: text('prompt').notNull(),
  promptVersion: integer('prompt_version').notNull(),
  promptHash: text('prompt_hash').notNull(),
  role: text('role', { enum: ['builder', 'auditor'] }).notNull(),
  vendor: text('vendor').notNull(),
  model: text('model').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  status: text('status', { enum: ['ok', 'error'] }).notNull(),
  error: text('error'),
  attempts: integer('attempts').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  ms: integer('ms').notNull(),
  ...provenance,
});

/** Every write to signoffs, audits and decisions appends here (Invariant 8). Append-only. */
export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull(),
  ...provenance,
});

/** A discovery session (Stage 4): the conversation in the site office. Append-only. */
export const discoverySessions = pgTable('discovery_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  title: text('title').notNull(),
  /** True when rebuilt afterwards from a record (a weekend reconstruction, a decisions log), not held live. */
  reconstructed: boolean('reconstructed').notNull().default(false),
  /** Where a reconstructed session came from. */
  source: text('source'),
  ...provenance,
});

/** One turn of a discovery session. Append-only; a model's draft is marked as one. */
export const discoveryTurns = pgTable('discovery_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => discoverySessions.id),
  seq: integer('seq').notNull(),
  /** The speaker's role or name: "member", "Rama", "Procurement Head". */
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  /** True for a question Rama drafted through packages/model: unconfirmed until the member uses it. */
  draft: boolean('draft').notNull().default(false),
  at: timestamp('at', { withTimezone: true }).notNull(),
  ...provenance,
});

/** Decision cards (MASTER-PROMPT §8 Decision). Append-only: a change is a new card that supersedes the old. */
export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.siteId),
    sessionId: uuid('session_id').references(() => discoverySessions.id),
    title: text('title').notNull(),
    statement: text('statement').notNull(),
    bricks: jsonb('bricks').$type<string[]>().notNull(),
    screenId: text('screen_id'),
    status: text('status', { enum: ['decided', 'open', 'not-built'] }).notNull(),
    /** The person who decided, by name. */
    by: text('by').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    reconstructed: boolean('reconstructed').notNull().default(false),
    supersedes: uuid('supersedes').references((): AnyPgColumn => decisions.id),
    ...provenance,
  },
  (t) => [
    // A card is superseded at most once: the chain never forks, even under concurrent writes.
    uniqueIndex('decisions_supersedes_once').on(t.supersedes),
  ],
);

/** Signatures (MASTER-PROMPT §8 Signoff). Append-only: a reversal is a new row that supersedes the old. */
export const signoffs = pgTable(
  'signoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.siteId),
    /** The person who signed, by name, and their row. */
    person: text('person').notNull(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    targetKind: text('target_kind', { enum: ['screen', 'brick'] }).notNull(),
    targetId: text('target_id').notNull(),
    targetCommit: text('target_commit').notNull(),
    statement: text('statement').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    supersedes: uuid('supersedes').references((): AnyPgColumn => signoffs.id),
    /** True when this row withdraws the signature it supersedes. */
    withdrawn: boolean('withdrawn').notNull().default(false),
    ...provenance,
  },
  (t) => [
    // A signature is superseded at most once: the chain never forks, even under concurrent writes.
    uniqueIndex('signoffs_supersedes_once').on(t.supersedes),
  ],
);

/**
 * Audit reports (Stage 5), one per run of the auditor on a site at a commit. Signed by the auditor's
 * vendor and model (its model_calls row), with the hash of exactly what it was given.
 */
export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  /** The commit the checks ran on. */
  commit: text('commit').notNull(),
  vendor: text('vendor').notNull(),
  model: text('model').notNull(),
  callId: uuid('call_id')
    .notNull()
    .references(() => modelCalls.id),
  /** sha256 of the canonical JSON the auditor received. */
  inputsHash: text('inputs_hash').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  /** Counts, checks run or not run, narration, alterations, time machine, verdict changes. */
  report: jsonb('report').$type<Record<string, unknown>>().notNull(),
  ...provenance,
});

/** One verdict per finding of an audit (MASTER-PROMPT §8 Finding): pass, note or defect on a brick. */
export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  auditId: uuid('audit_id')
    .notNull()
    .references(() => audits.id),
  brick: text('brick').notNull(),
  check: text('check').notNull(),
  verdict: text('verdict', { enum: ['pass', 'note', 'defect'] }).notNull(),
  text: text('text').notNull(),
  file: text('file'),
  line: integer('line'),
  /** The auditor's explanation when it downgraded the checks' verdict; the checks' verdict is kept too. */
  checkVerdict: text('check_verdict', { enum: ['pass', 'note', 'defect'] }).notNull(),
  auditorNote: text('auditor_note'),
  ...provenance,
});

/**
 * A named person's confirmation of an audit report's drafted text (the auditor's narration, alterations
 * and time machine), which stays marked unconfirmed until one exists (Invariant 6). Append-only.
 */
export const auditConfirmations = pgTable('audit_confirmations', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  auditId: uuid('audit_id')
    .notNull()
    .references(() => audits.id),
  person: text('person').notNull(),
  personId: uuid('person_id')
    .notNull()
    .references(() => people.id),
  statement: text('statement').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  ...provenance,
});

/** Tables whose rows are never updated or deleted; the migrations install a trigger that refuses both. */
export const APPEND_ONLY_TABLES = [
  'model_calls',
  'audit_log',
  'discovery_sessions',
  'discovery_turns',
  'decisions',
  'signoffs',
  'audits',
  'findings',
  'audit_confirmations',
] as const;

/** Tables whose every insert also appends an audit_log row, written by a trigger (Invariant 8). */
export const AUDITED_TABLES = [
  'decisions',
  'signoffs',
  'audits',
  'findings',
  'audit_confirmations',
] as const;
