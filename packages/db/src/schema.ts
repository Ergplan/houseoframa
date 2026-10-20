// The House of Rama data model. Every table carries site_id, created_at and created_by (Invariant 8);
// site_id is nullable only on people. created_by is a person id or `rama:<component>@<version>`.
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
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

/** Tables whose rows are never updated or deleted; the migration installs a trigger that refuses both. */
export const APPEND_ONLY_TABLES = ['model_calls', 'audit_log'] as const;
