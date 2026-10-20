// rama-trace capture <site> [--no-build]   photograph the site's screens and re-execute its traced figures
// rama-trace show <site>                    print the Showroom's screens, figures and trails as JSON
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { capture } from './capture.ts';
import { captureDir, readCapture, showroomOf } from './showroom.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const USAGE = 'usage:\n  rama-trace capture <site> [--no-build]\n  rama-trace show <site>';

async function main(argv: string[]): Promise<number> {
  const [command, id] = argv;
  if (!id || (command !== 'capture' && command !== 'show')) throw new Error(USAGE);
  const site = locateSite(id);
  if (!site) throw new Error(`no site "${id}"`);
  const bp = readSiteBlueprint(site);
  if (!bp) throw new Error(`site "${id}" has no Blueprint yet: run \`rama site extract ${id}\``);
  if (command === 'capture') {
    const c = await capture(site, bp, {
      outDir: captureDir(id),
      build: !argv.includes('--no-build'),
      log: (s) => console.error(s),
    });
    const s = showroomOf(c, bp);
    const runs = Object.values(s.trails);
    console.error(
      `captured ${c.screens.length} screens into ${captureDir(id)}: ${s.counts.traced} of ${s.counts.shown} figures traced; ` +
        `${runs.filter((t) => t.reexecuted).length} of ${runs.length} trails re-executed, ${runs.filter((t) => t.result?.matches).length} match the screen`,
    );
    return 0;
  }
  const c = readCapture(id);
  if (!c) throw new Error(`site "${id}" has no capture yet: run \`rama-trace capture ${id}\``);
  process.stdout.write(JSON.stringify(showroomOf(c, bp), null, 2) + '\n');
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(2);
  },
);
