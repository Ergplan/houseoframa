// The sample product's packages, without a network (rule 16: Test drive runs on a laptop in minutes):
// its node_modules is made of links to the packages House of Rama already has installed, at the same
// versions the sample's package.json names. A product with its own install does not use this.
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { homeDir } from '@rama/db';

/** Package → the House of Rama workspace that depends on it (where pnpm put its link). */
const FROM: Record<string, string> = {
  next: 'apps/rama',
  react: 'apps/rama',
  'react-dom': 'apps/rama',
  '@types/react': 'apps/rama',
  '@types/react-dom': 'apps/rama',
  'drizzle-orm': 'packages/db',
  postgres: 'packages/db',
  typescript: '.',
  vitest: '.',
  '@types/node': '.',
};
const BINS: Record<string, string> = {
  next: 'next/dist/bin/next',
  vitest: 'vitest/vitest.mjs',
  tsc: 'typescript/bin/tsc',
};

/** The links to make, or the reason House of Rama cannot supply the product's packages. */
function plan(repoDir: string): { links: [string, string][] } | { reason: string } {
  const home = homeDir();
  const manifest = path.join(repoDir, 'package.json');
  if (!existsSync(manifest)) return { reason: 'it has no package.json' };
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const links: [string, string][] = [];
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const from = FROM[name];
    if (!from) return { reason: `House of Rama does not carry ${name}` };
    const at = path.join(home, from, 'node_modules', name);
    if (!existsSync(at)) return { reason: `House of Rama has no ${name} installed` };
    const src = realpathSync(at);
    const have = (
      JSON.parse(readFileSync(path.join(src, 'package.json'), 'utf8')) as { version: string }
    ).version;
    if (have !== version)
      return { reason: `it wants ${name} ${version} and House of Rama has ${have}` };
    links.push([name, src]);
  }
  return { links };
}

/**
 * Links the product's node_modules to House of Rama's packages when every one it names is there at the
 * same version; otherwise does nothing and says why (the product's own install runs instead).
 */
export function linkHouseModules(repoDir: string): { linked: boolean; reason?: string } {
  const nm = path.join(repoDir, 'node_modules');
  if (existsSync(nm)) return { linked: false, reason: 'it already has its packages' };
  const p = plan(repoDir);
  if ('reason' in p) return { linked: false, reason: p.reason };
  mkdirSync(path.join(nm, '.bin'), { recursive: true });
  for (const [name, src] of p.links) {
    const dest = path.join(nm, name);
    mkdirSync(path.dirname(dest), { recursive: true });
    symlinkSync(src, dest);
  }
  for (const [bin, target] of Object.entries(BINS))
    if (p.links.some(([n]) => n === target.split('/')[0]))
      symlinkSync(path.join('..', target), path.join(nm, '.bin', bin));
  return { linked: true };
}
