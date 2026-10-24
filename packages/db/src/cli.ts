// `pnpm --filter @rama/db migrate|seed`, and `pnpm rama-pod add` (Stage 6). Reads DATABASE_URL from the environment; the seed's owner is ownerName() (members.ts)
// (the root .env is loaded when present).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';
import { ownerName, readMembers } from './members.ts';
import { pods } from './schema.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const command = process.argv[2];
const { db, close } = createDb();
try {
  if (command === 'migrate') {
    await runMigrations(db);
    console.log('migrations applied');
  } else if (command === 'seed') {
    const memberName = ownerName();
    const role = readMembers().find((m) => m.name === memberName)?.role;
    const { member, site } = await seed(db, { memberName, ...(role ? { role } : {}) });
    console.log(`seeded site "${site.siteId}" owned by ${member.name}`);
  } else if (command === 'pod' && process.argv[3] === 'add') {
    // rama-pod add <n> <name…>: a pod on the floor.
    const n = Number(process.argv[4]);
    const name = process.argv.slice(5).join(' ');
    if (!Number.isInteger(n) || n < 1 || !name)
      throw new Error('usage: rama-pod add <number> <name>');
    await db
      .insert(pods)
      .values({ pod: n, name, createdBy: 'rama:db-cli@0.1.0' })
      .onConflictDoNothing();
    console.log(`pod ${n}: ${name}`);
  } else {
    console.error('usage: cli.ts migrate|seed|pod add');
    process.exitCode = 2;
  }
} finally {
  await close();
}
