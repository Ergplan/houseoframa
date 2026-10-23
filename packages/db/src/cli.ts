// `pnpm --filter @rama/db migrate|seed`, and `pnpm rama-member add|link` (Stage 6). Reads DATABASE_URL and RAMA_MEMBER_NAME from the environment
// (the root .env is loaded when present).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';
import { addMember, issueLink } from './auth.ts';

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
  } else if (command === 'member' && process.argv[3] === 'add') {
    // rama-member add <email> <name…> [--manager]: a member who signs in by link to that address.
    const args = process.argv.slice(4).filter((a) => a !== '--manager');
    const [email, ...name] = args;
    if (!email || !name.length)
      throw new Error('usage: rama-member add <email> <name> [--manager]');
    const m = await addMember(db, {
      email,
      name: name.join(' '),
      role: process.argv.includes('--manager') ? 'manager' : undefined,
      createdBy: 'rama:db-cli@0.1.0',
    });
    console.log(`${m.name} <${m.email}> is a ${m.role}`);
  } else if (command === 'member' && process.argv[3] === 'link') {
    // rama-member link <email>: a sign-in link printed here, for whoever has this machine's shell.
    const email = process.argv[4];
    if (!email) throw new Error('usage: rama-member link <email>');
    const r = await issueLink(db, email);
    if (!r) throw new Error(`no member signs in as ${email}`);
    const base = process.env.RAMA_BASE_URL ?? 'http://localhost:3000';
    console.log(`${base}/auth/verify?token=${r.token}`);
  } else {
    console.error('usage: cli.ts migrate|seed|member add|member link');
    process.exitCode = 2;
  }
} finally {
  await close();
}
