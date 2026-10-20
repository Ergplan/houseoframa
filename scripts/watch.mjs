// Continuous checks beside the build. Stage 0 fills in the real checks (eslint, prettier, tsc, vitest,
// drizzle-kit check, blueprint drift). Until then it records that nothing is wired, honestly.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
mkdirSync('.watch', { recursive: true });
const checks = [{ name: 'wired', ok: false, ms: 0, detail: 'Stage 0 has not run: no checks are wired yet' }];
const status = { ok: checks.every(c => c.ok), checks, at: new Date().toISOString() };
writeFileSync('.watch/status.json', JSON.stringify(status, null, 2));
appendFileSync('.watch/log.txt', `${status.at} ok=${status.ok}\n`);
console.log(JSON.stringify(status));
