// Records the rehearsal's audio (Stage 10): each thing the member says in fixtures/rehearsal/script.json,
// spoken by OpenAI's speech model (packages/model synthesize, prompt clip.v1) into the clip it names.
// Engineers only: `pnpm record-rehearsal`. Costs a few rupees; the clips are committed and reused.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SELF_SITE_ID } from '@rama/db';
import { synthesize } from '@rama/model';

if (existsSync('.env')) process.loadEnvFile('.env');
const dir = path.resolve(import.meta.dirname, '../fixtures/rehearsal');
const script = JSON.parse(readFileSync(path.join(dir, 'script.json'), 'utf8')) as {
  turns: { text: string; clip: string }[];
};
const done = new Set<string>();
for (const t of script.turns) {
  if (done.has(t.clip)) continue;
  done.add(t.clip);
  const wav = await synthesize({
    text: t.text,
    voice: 'cedar',
    siteId: SELF_SITE_ID,
    createdBy: 'rama:record-rehearsal@0.1.0',
  });
  writeFileSync(path.join(dir, t.clip), wav);
  console.log(`${t.clip}: ${t.text} (${Math.round(wav.length / 1024)} KB)`);
}
