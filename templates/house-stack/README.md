# {{name}}

{{idea}}

Built in House of Rama on the house stack (Next.js, TypeScript, Postgres, Drizzle). Every number on a
screen is a figure traced to the function that works it out, and every screen is walked and signed by
name before it merges.

- `features/<building>/`: one folder for each thing the product does, named as `.rama/features.json` names it.
- `app/`: the screens. Each one is the glass front of its building.
- `rama/figures.ts`: every figure, with its function and what it means in the customer's words.
- `components/Figure.tsx`: the only way a screen shows a number. `npm run lint:figures` (run before every
  build) fails on any number shown another way, naming the file and line.
- `.rama/screens.json`: which screens House of Rama photographs, and who each is for.
- `db/schema.ts`: the tables.
