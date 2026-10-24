// The stall's one table: every order taken, in paise (100 paise make a rupee). Like every table on the
// house stack it carries its provenance: the stall it belongs to, when the row was written and by whom.
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  siteId: text('site_id').notNull(),
  item: text('item').notNull(),
  cups: integer('cups').notNull(),
  pricePaise: integer('price_paise').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
});
