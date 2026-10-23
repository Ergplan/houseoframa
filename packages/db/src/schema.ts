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

/**
 * Members and reviewers. A member signs in by a link mailed to `email` (Stage 6); a `manager` also sees
 * the campus. Before Stage 6 there was one person, the local member, with no email.
 */
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').references((): AnyPgColumn => sites.siteId),
  name: text('name').notNull().unique(),
  email: text('email').unique(),
  role: text('role', { enum: ['member', 'manager'] })
    .notNull()
    .default('member'),
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

/**
 * A magic sign-in link (Stage 6): only the sha256 of its token is kept. It works once (`used_at`) and
 * until `expires_at`. `site_id` is null: a link belongs to a person, not a site.
 */
export const loginLinks = pgTable('login_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').references(() => sites.siteId),
  personId: uuid('person_id')
    .notNull()
    .references(() => people.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ...provenance,
});

/** A signed-in browser: the sha256 of the cookie's token, until it expires or is revoked (sign-out). */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').references(() => sites.siteId),
  personId: uuid('person_id')
    .notNull()
    .references(() => people.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...provenance,
});

/** A pod on the floor, by number, and the box it runs on. */
export const pods = pgTable('pods', {
  pod: integer('pod').primaryKey(),
  siteId: text('site_id').references(() => sites.siteId),
  name: text('name').notNull(),
  ...provenance,
});

/**
 * A booking of a pod (MASTER-PROMPT Stage 6): a member, a shift (`work` on a site, or `game` mode), and
 * when. Opening /pod/<n> during a work booking loads its site.
 */
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').references(() => sites.siteId),
  pod: integer('pod')
    .notNull()
    .references(() => pods.pod),
  personId: uuid('person_id')
    .notNull()
    .references(() => people.id),
  shift: text('shift', { enum: ['work', 'game'] }).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  ...provenance,
});

/**
 * A member's own report, some time after handover, of whether the product is in use (the campus's
 * "in use at 90 days"). Append-only: a later check-in is a new row.
 */
export const checkins = pgTable('checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  personId: uuid('person_id')
    .notNull()
    .references(() => people.id),
  inUse: boolean('in_use').notNull(),
  note: text('note'),
  at: timestamp('at', { withTimezone: true }).notNull(),
  ...provenance,
});

/**
 * A site handed over (Stage 6): at its final signed audit, with the structure a named person confirmed.
 * Append-only and audited: the certificate and the keys page are read from it.
 */
export const handovers = pgTable('handovers', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.siteId),
  auditId: uuid('audit_id')
    .notNull()
    .references(() => audits.id),
  commit: text('commit').notNull(),
  personId: uuid('person_id')
    .notNull()
    .references(() => people.id),
  person: text('person').notNull(),
  /** The load-bearing bricks as confirmed (.rama/structure.json at the time). */
  structure: jsonb('structure').$type<Record<string, unknown>>().notNull(),
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
  'checkins',
  'handovers',
] as const;

/** Tables whose every insert also appends an audit_log row, written by a trigger (Invariant 8). */
export const AUDITED_TABLES = [
  'decisions',
  'signoffs',
  'audits',
  'findings',
  'audit_confirmations',
  'handovers',
] as const;
