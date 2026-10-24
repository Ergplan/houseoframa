// The stall's one table: every order taken, in paise (100 paise make a rupee).
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  item: text('item').notNull(),
  cups: integer('cups').notNull(),
  pricePaise: integer('price_paise').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
