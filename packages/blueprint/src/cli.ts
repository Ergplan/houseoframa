// rama extract <repoPath> [--out file] [--check file] [--rev R] [--worktree] [--exclude glob]...
//                         [--repo id] [--draft-glossary [--glossary-out file] [--site id]]
// rama diff <a.json> <b.json>
// rama site add <gitUrl|path> [--id id] [--name name] | site extract <id> | site check <id> | site draft <id> | site list
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Blueprint } from '@rama/shared';
import { diffBlueprints, formatDiff } from './diff.ts';
import { draftGlossary, draftPurposes } from './draft.ts';
import { extract, type ExtractOptions } from './extract.ts';
import { Glossary } from './glossary.ts';
import { canonicalJson } from './json.ts';
import { summary } from './metrics/index.ts';
import { readWorktree, topLevel } from './git.ts';
import {
  addSite,
  checkSiteBlueprint,
  GLOSSARY_FILE,
  listSites,
  locateSite,
  PURPOSES_FILE,
  readSiteOverlay,
  siteReader,
  writeSiteBlueprint,
  writeSiteOverlay,
  type SiteLocation,
} from './site.ts';
import { registerSite } from './register.ts';

const USAGE = `usage:
  rama extract <repoPath> [--out file] [--check file] [--rev R] [--worktree] [--exclude glob]...
                          [--repo id] [--draft-glossary [--glossary-out file] [--site id]]
  rama diff <a.json> <b.json>
  rama site add <gitUrl|path> [--id id] [--name name]
  rama site extract <id>
  rama site check <id>
  rama site draft <id> [--only glossary|purposes]
  rama site list`;

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const valued = new Set(['--out', '--check', '--rev', '--exclude', '--repo', '--glossary-out', '--site', '--id', '--name', '--only']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const value = valued.has(a) ? argv[++i] : 'true';
      if (value === undefined) throw new Error(`${a} needs a value`);
      flags.set(a, [...(flags.get(a) ?? []), value]);
    } else positional.push(a);
  }
  return { positional, flag: (n: string) => flags.get(n)?.at(-1), all: (n: string) => flags.get(n) ?? [] };
}

const readBlueprint = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Blueprint;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  if (command === 'diff') {
    const [a, b] = args.positional;
    if (!a || !b) throw new Error(USAGE);
    const d = diffBlueprints(readBlueprint(a), readBlueprint(b));
    console.log(formatDiff(d));
    return d.identical ? 0 : 1;
  }

  if (command === 'site') return site(args);
  if (command !== 'extract') throw new Error(USAGE);
  const repoPath = args.positional[0];
  if (!repoPath) throw new Error(USAGE);
  const opts: ExtractOptions = {
    rev: args.flag('--rev'),
    worktree: args.flag('--worktree') === 'true',
    exclude: args.all('--exclude'),
    repo: args.flag('--repo'),
  };

  if (args.flag('--draft-glossary') === 'true') {
    const root = topLevel(repoPath);
    const out = path.resolve(args.flag('--glossary-out') ?? path.join(root, '.rama/glossary.json'));
    const existing = existsSync(out) ? Glossary.parse(JSON.parse(readFileSync(out, 'utf8'))) : {};
    const first = extract(repoPath, { ...opts, glossaryExtra: existing });
    const texts = new Map(readWorktree(root, []).map((f) => [f.path, f.content.toString('utf8')]));
    const drafted = await draftGlossary(first, existing, (p) => texts.get(p) ?? null, {
      siteId: args.flag('--site') ?? 'self',
    });
    const merged = { ...drafted, ...existing }; // never overwrite an existing phrase
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, canonicalJson(merged));
    console.error(`drafted ${Object.keys(drafted).length} unconfirmed phrases into ${out}`);
    opts.glossaryExtra = merged;
  }

  const bp = extract(repoPath, opts);
  const json = canonicalJson(bp);
  const check = args.flag('--check');
  if (check) {
    const current = existsSync(check) ? readFileSync(check, 'utf8') : '';
    if (current === json) {
      console.log(`${check} is up to date`);
      return 0;
    }
    console.log(`${check} has drifted from \`rama extract\`:`);
    console.log(current ? formatDiff(diffBlueprints(JSON.parse(current) as Blueprint, bp)) : '(file missing)');
    return 1;
  }
  const out = args.flag('--out');
  if (out) {
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, json);
    console.error(`wrote ${out}`);
    console.error(JSON.stringify(summary(bp), null, 2));
  } else {
    process.stdout.write(json);
  }
  return 0;
}

function located(id: string | undefined): SiteLocation {
  if (!id) throw new Error(USAGE);
  const s = locateSite(id);
  if (!s) throw new Error(`no site "${id}": add it with \`rama site add <gitUrl|path> --id ${id}\``);
  return s;
}

async function site(args: ReturnType<typeof parseArgs>): Promise<number> {
  const [sub, target] = args.positional;
  if (sub === 'list') {
    for (const s of listSites()) console.log(`${s.id}\t${s.name}\t${s.repoDir}`);
    return 0;
  }
  if (sub === 'add') {
    if (!target) throw new Error(USAGE);
    const { site: added, blueprint } = addSite(target, { id: args.flag('--id'), name: args.flag('--name') });
    console.error(`cloned into ${added.repoDir}`);
    console.error(`wrote ${added.blueprintPath}`);
    console.error(JSON.stringify(summary(blueprint), null, 2));
    if (process.env.DATABASE_URL) {
      await registerSite({ siteId: added.id, name: added.name, repo: blueprint.repo, memberName: process.env.RAMA_MEMBER_NAME });
      console.error(`site "${added.id}" registered for ${process.env.RAMA_MEMBER_NAME}`);
    } else {
      console.error('DATABASE_URL is not set: the site is not registered, and model drafting for it will be refused');
    }
    return 0;
  }
  if (sub === 'check') {
    const res = checkSiteBlueprint(located(target));
    console.log(res.detail);
    return res.ok ? 0 : 1;
  }
  if (sub === 'extract') {
    const s = located(target);
    const bp = writeSiteBlueprint(s);
    console.error(`wrote ${s.blueprintPath}`);
    console.error(JSON.stringify(summary(bp), null, 2));
    return 0;
  }
  if (sub === 'draft') {
    const s = located(target);
    const only = args.flag('--only');
    if (only && only !== 'glossary' && only !== 'purposes') throw new Error(USAGE);
    const bp = writeSiteBlueprint(s);
    const read = siteReader(s);
    // Each batch is saved as it arrives, so a failed call keeps what was already drafted (and paid for).
    // An existing entry is never overwritten: a draft only fills a gap.
    if (only !== 'purposes') {
      const existing = readSiteOverlay(s, GLOSSARY_FILE);
      const drafted = await draftGlossary(bp, existing, read, {
        siteId: s.id,
        onBatch: (d, done, total) => {
          writeSiteOverlay(s, GLOSSARY_FILE, { ...d, ...existing });
          console.error(`phrases: ${done}/${total}`);
        },
        onError: (err, keys) => console.error(`phrases: skipped a batch of ${keys.length} (${err.message.slice(0, 120)})`),
      });
      console.error(`drafted ${Object.keys(drafted).length} unconfirmed phrases into ${GLOSSARY_FILE}`);
    }
    if (only !== 'glossary') {
      const existing = readSiteOverlay(s, PURPOSES_FILE);
      const drafted = await draftPurposes(bp, existing, read, {
        siteId: s.id,
        onBatch: (d, done, total) => {
          writeSiteOverlay(s, PURPOSES_FILE, { ...d, ...existing });
          console.error(`purposes: ${done}/${total}`);
        },
        onError: (err, keys) => console.error(`purposes: skipped a batch of ${keys.length} (${err.message.slice(0, 120)})`),
      });
      console.error(`drafted ${Object.keys(drafted).length} unconfirmed purposes into ${PURPOSES_FILE}`);
    }
    writeSiteBlueprint(s);
    console.error(`wrote ${s.blueprintPath}`);
    return 0;
  }
  throw new Error(USAGE);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(2);
  },
);
