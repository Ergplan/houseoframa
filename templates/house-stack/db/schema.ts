// The product's tables, in Drizzle (the ground of the Street). Every table carries its provenance: the
// product it belongs to, when the row was written and by whom. Spread `provenance()` into each one:
//
//   export const orders = pgTable('orders', { id: serial('id').primaryKey(), ...provenance(), … });
import { text, timestamp } from 'drizzle-orm/pg-core';

export const provenance = () => ({
  siteId: text('site_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
});
