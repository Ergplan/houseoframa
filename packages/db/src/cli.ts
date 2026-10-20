// `pnpm --filter @rama/db migrate|seed`. Reads DATABASE_URL and RAMA_MEMBER_NAME from the environment
// (the root .env is loaded when present).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const command = process.argv[2];
const { db, close } = createDb();
try {
  if (command === 'migrate') {
    await runMigrations(db);
    console.log('migrations applied');
  } else if (command === 'seed') {
    const { member, site } = await seed(db, { memberName: process.env.RAMA_MEMBER_NAME });
    console.log(`seeded site "${site.siteId}" owned by ${member.name}`);
  } else {
    console.error('usage: cli.ts migrate|seed');
    process.exitCode = 2;
  }
} finally {
  await close();
}
