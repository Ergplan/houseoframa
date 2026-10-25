# Chai Stall

The sample product of House of Rama: a chai stall takes orders through the day and sees the day's
takings and the GST on them. Three screens (the orders, a new order, the day's total), five figures
traced to the functions that compute them (`rama/figures.ts`), and two tests.

Until a database is connected the stall reads its sample day from `data/orders.json`; the rows hold the
order fields of the `orders` table in `db/schema.ts`.
