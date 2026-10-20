// rama extract <repoPath> [--out file] [--check file] [--rev R] [--worktree] [--exclude glob]...
//                         [--repo id] [--draft-glossary [--glossary-out file] [--site id]]
// rama diff <a.json> <b.json>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Blueprint } from '@rama/shared';
import { diffBlueprints, formatDiff } from './diff.ts';
import { draftGlossary } from './draft.ts';
import { extract, type ExtractOptions } from './extract.ts';
import { Glossary } from './glossary.ts';
import { canonicalJson } from './json.ts';
import { summary } from './metrics/index.ts';
import { readWorktree, topLevel } from './git.ts';

const USAGE = `usage:
  rama extract <repoPath> [--out file] [--check file] [--rev R] [--worktree] [--exclude glob]...
                          [--repo id] [--draft-glossary [--glossary-out file] [--site id]]
  rama diff <a.json> <b.json>`;

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const valued = new Set(['--out', '--check', '--rev', '--exclude', '--repo', '--glossary-out', '--site']);
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

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(2);
  },
);
