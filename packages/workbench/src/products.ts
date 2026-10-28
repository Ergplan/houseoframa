// Products (Stage 7): a site House of Rama builds, as against an outside site it only renders. "New
// product" takes a name and a one-line idea and makes the product's site (a new git repository in
// work/<id>/repo, first commit by the person), its first decision card (open until someone says yes),
// the gate workflow with House of Rama's public key, and, when GitHub is set in Settings, its repository
// on GitHub with the work pushed there. A step that cannot be done is a flag with a plain sentence and
// the next action; the product is kept on this laptop until it can.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createProductSite,
  GITHUB_NAME,
  locateSite,
  siteRecord,
  updateSiteRecord,
  writeSiteBlueprint,
  type SiteLocation,
} from '@rama/blueprint/site';
import { appSealer, decide, installGate } from '@rama/ceremony';
import {
  GITHUB_OWNER,
  getSetting,
  homeDir,
  readSecret,
  sites,
  type Db,
  type Member,
} from '@rama/db';
import { createRepository, GITHUB_API, GitHubError, pushTo, type GitHubDeps } from './github.ts';

export const PRODUCT_COMPONENT = 'rama:workbench-product@0.1.0';

/** One outcome a person reads: green when done, grey when not, with what happens next. */
export interface Flag {
  ok: boolean;
  sentence: string;
  /** What the builder (or the person) does next, when the step was not done. */
  next?: string;
}

/** A product's id from its name: lowercase words joined by dashes, made unique with -2, -3… */
export function productId(name: string, taken: (id: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36)
      .replace(/-+$/, '') || 'product';
  const id = base === 'self' ? 'self-product' : base;
  if (!taken(id)) return id;
  for (let n = 2; ; n++) if (!taken(`${id}-${n}`)) return `${id}-${n}`;
}

const git = (repoDir: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync('git', ['-C', repoDir, ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Commits everything in the checkout as the person, by House of Rama. */
export function commitAll(
  repoDir: string,
  message: string,
  person: string,
  at = new Date(),
): string {
  git(repoDir, ['add', '-A']);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: person,
    GIT_AUTHOR_EMAIL: 'people@houseoframa.local',
    GIT_COMMITTER_NAME: 'House of Rama',
    GIT_COMMITTER_EMAIL: 'rama@houseoframa.local',
    GIT_AUTHOR_DATE: at.toISOString(),
    GIT_COMMITTER_DATE: at.toISOString(),
  };
  git(repoDir, ['commit', '--quiet', '--allow-empty', '-m', message], env);
  return git(repoDir, ['rev-parse', 'HEAD']).trim();
}

/** The House of Rama commit a product's gate is pinned to: this checkout's HEAD, else main. */
export function houseRef(): string {
  try {
    const r = spawnSync('git', ['-C', homeDir(), 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    const sha = r.stdout.trim();
    return r.status === 0 && /^[0-9a-f]{40}$/.test(sha) ? sha : 'main';
  } catch {
    return 'main';
  }
}

export interface ProductDeps {
  github: GitHubDeps;
  env: NodeJS.ProcessEnv;
  now: () => Date;
}

/** RAMA_GITHUB_API replaces GitHub's address for an engineer's stub (the end-to-end test); unset in use. */
export const defaultProductDeps = (): ProductDeps => ({
  github: { fetch: globalThis.fetch, api: process.env.RAMA_GITHUB_API || GITHUB_API },
  env: process.env,
  now: () => new Date(),
});

const README = (name: string, idea: string) =>
  `# ${name}\n\n${idea}\n\nBuilt in House of Rama: every screen is walked and signed by name before it merges.\n`;

export const REPOSITORY_NAME_RULE =
  'A name on GitHub uses letters, digits, dots, dashes and underscores, and no spaces.';
/** Whether GitHub accepts the name for a repository. */
export const repositoryNameOk = (name: string) => GITHUB_NAME.test(name);

/** A new product: its site, first commit, first decision card, gate, and repository when GitHub is set. */
export async function newProduct(
  db: Db,
  input: { name: string; idea: string; repository?: string; person: Member },
  deps: ProductDeps = defaultProductDeps(),
): Promise<{ site: SiteLocation; flags: Flag[] }> {
  const name = input.name.trim();
  const idea = input.idea.trim();
  const repository = input.repository?.trim() || undefined;
  if (!name) throw new Error('A product needs a name.');
  if (!idea) throw new Error('A product needs its idea in one line.');
  if (repository && !repositoryNameOk(repository)) throw new Error(REPOSITORY_NAME_RULE);
  const id = productId(name, (x) => locateSite(x, deps.env) !== null);
  const at = deps.now();
  const sealer = appSealer(deps.env);
  const site = createProductSite(
    { id, name, idea, repository, env: deps.env, now: () => at },
    (repoDir) => {
      git(repoDir, ['init', '--quiet', '--initial-branch=main']);
      writeFileSync(path.join(repoDir, 'README.md'), README(name, idea));
      writeFileSync(path.join(repoDir, '.gitignore'), 'node_modules/\n.next/\n');
      mkdirSync(path.join(repoDir, '.rama'), { recursive: true });
      installGate(repoDir, houseRef(), sealer.publicKey);
    },
  );
  await db.insert(sites).values({
    siteId: id,
    name,
    repo: id,
    memberId: input.person.id,
    createdBy: input.person.id,
  });
  await decide(
    db,
    { id, repoDir: site.repoDir },
    {
      title: `Build ${name}`,
      statement: idea,
      bricks: [],
      status: 'open',
      by: input.person.name,
      at,
      createdBy: input.person.id,
    },
  );
  commitAll(site.repoDir, `Start ${name}: ${idea}`, input.person.name, at);
  writeSiteBlueprint(site);
  const flags: Flag[] = [
    { ok: true, sentence: `${name} is set up on this laptop, with its first decision card open.` },
    { ok: true, sentence: 'The merge gate is in place: nothing joins the product unsigned.' },
  ];
  flags.push(await createProductRepository(db, id, deps));
  return { site, flags };
}

/**
 * Creates the product's repository on GitHub under the account in Settings and sends the work there,
 * recording it on the site. A grey flag says what is missing when it cannot.
 */
export async function createProductRepository(
  db: Db,
  siteId: string,
  deps: ProductDeps = defaultProductDeps(),
): Promise<Flag> {
  const site = locateSite(siteId, deps.env);
  const record = siteRecord(siteId, deps.env);
  if (!site || !record || record.kind !== 'product')
    return { ok: false, sentence: 'Only a product built here gets a place on GitHub.' };
  if (record.remote) return { ok: true, sentence: `It is on GitHub at ${record.remote}.` };
  const token = await readSecret(db, 'GITHUB_TOKEN', deps.env);
  const owner = (await getSetting<{ owner: string }>(db, GITHUB_OWNER))?.owner;
  if (!token || !owner)
    return {
      ok: false,
      sentence: 'The product is kept on this laptop: no GitHub account is set yet.',
      next: `Enter the GitHub token and account in Settings, then press "Create it on GitHub" on ${site.name}.`,
    };
  try {
    const repo = await createRepository(
      token,
      owner,
      record.repository ?? site.id,
      record.idea ?? site.name,
      deps.github,
    );
    pushTo(site.repoDir, repo.cloneUrl, token);
    updateSiteRecord(siteId, { remote: repo.htmlUrl }, deps.env);
    return { ok: true, sentence: `${repo.fullName} is created on GitHub and holds the work.` };
  } catch (err) {
    if (!(err instanceof GitHubError)) throw err;
    return {
      ok: false,
      sentence: err.message,
      next: `Fix this in Settings, then press "Create it on GitHub" on ${site.name}.`,
    };
  }
}
