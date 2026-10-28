import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb, runMigrations, seed } from '@rama/db';
import { startSession } from '@rama/ceremony';
import { DiscoveryView } from '../../../components/ceremony/DiscoveryView';
import { isValidElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import SitePage from './page';
import Discovery from './discovery/page';
import { SiteShell } from '../../../components/workbench/SiteShell';
import { InsideView } from '../../../components/lakefront/InsideView';
import { inner } from '../../../test/shell';
import { StreetView } from '../../../components/lakefront/StreetView';
import { BuildingView } from '../../../components/lakefront/BuildingView';
import { bannedIn, visibleText } from '../../../test/banned';

// The lakefront's views route with useRouter; the page's own notFound stays the real one.
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

// A signed-in member who owns every site (authorization is tested in app/authz.test.tsx).
vi.mock('../../../server/session', async (orig) =>
  (await import('../../../test/session-mock')).sessionMock(await orig()),
);

const params = (siteId: string, q: Record<string, string> = {}) => ({
  params: Promise.resolve({ siteId }),
  searchParams: Promise.resolve(q),
});
const notFound = /NEXT_HTTP_ERROR_FALLBACK;404/;

// Find an element of a type in the page's tree.
const find = (node: unknown, type: unknown): ReactElement | null => {
  if (!isValidElement(node))
    return Array.isArray(node) ? (node.map((n) => find(n, type)).find(Boolean) ?? null) : null;
  if (node.type === type) return node;
  const props = node.props as { children?: unknown };
  return find(props.children, type);
};

describe('route /site/[siteId]', () => {
  it('opens on the Street, every building named, with the breadcrumb in plain words', async () => {
    const page = (await SitePage(params('self'))) as ReactElement<{
      console: { siteId: string };
      levels: { label: string }[];
    }>;
    expect(page.type).toBe(SiteShell);
    expect(page.props.console.siteId).toBe('self');
    expect(page.props.levels.map((l) => l.label)).toEqual(['Street']);
    const el = find(page, StreetView) as ReactElement<ComponentProps<typeof StreetView>>;
    expect(el).not.toBeNull();
    const names = el.props.street.buildings.map((b) => b.name);
    expect(names).toContain('Show a product as a lakefront');
    expect(el.props.named).toBe(true);
    const html = renderToStaticMarkup(el);
    for (const n of names) expect(visibleText(html)).toContain(n);
  });

  it('opens a building at ?b=, and its inside at ?at=code, with the levels in the breadcrumb', async () => {
    const b = (await SitePage(params('self', { b: 'keep-the-keys' }))) as ReactElement<{
      levels: { label: string; href?: string }[];
    }>;
    expect(b.props.levels).toEqual([
      { label: 'Street', href: '/site/self' },
      { label: 'Keep the keys' },
    ]);
    const view = find(b, BuildingView) as ReactElement<ComponentProps<typeof BuildingView>>;
    expect(view.props.building.id).toBe('keep-the-keys');
    expect(view.props.scene.facades.map((f) => f.screen)).toEqual(['apps/rama/app:/settings']);

    const code = (await SitePage(
      params('self', { b: 'keep-the-keys', at: 'code' }),
    )) as ReactElement<{
      levels: { label: string }[];
    }>;
    // The third level is the inside of the same building (Stage 11).
    expect(code.props.levels.map((l) => l.label)).toEqual(['Street', 'Keep the keys', 'inside']);
    const el = find(code, InsideView) as ReactElement<ComponentProps<typeof InsideView>>;
    const self = JSON.parse(
      readFileSync(new URL('../../../../../blueprint/self.json', import.meta.url), 'utf8'),
    );
    expect(el.props.siteId).toBe('self');
    expect(el.props.building.id).toBe('keep-the-keys');
    expect(el.props.camera.level).toBe('code');
    expect(el.props.blueprint.repo).toBe('Ergplan/houseoframa');
    expect(el.props.blueprint.nodes).toHaveLength(self.nodes.length);
    expect(Object.keys(el.props.screenStates!.tally)).toEqual([
      'Verified',
      'Confirmed',
      'Unverified',
    ]);
    // Every file stands inside some building, so each one opens somewhere.
    expect(Object.keys(el.props.owners).sort()).toEqual(
      self.nodes.map((n: { path: string }) => n.path).sort(),
    );
    // A decision card's link to a brick opens the inside of the building it stands in, on it.
    const card = find(
      await SitePage(params('self', { brick: 'package.json' })),
      InsideView,
    ) as ReactElement<ComponentProps<typeof InsideView>>;
    expect(card.props.initialBrick).toBe('package.json');
    expect(card.props.building.bricks).toContain('package.json');
    // A building that is not there is the Street.
    expect(find(await SitePage(params('self', { b: 'nope' })), StreetView)).not.toBeNull();
  });

  it('says no developer word at the Street or Building level (design/harmony/glossary.json)', async () => {
    const street = find(await SitePage(params('self')), StreetView)!;
    expect(bannedIn(visibleText(renderToStaticMarkup(street)))).toEqual([]);
    const all = find(await SitePage(params('self')), StreetView) as ReactElement<
      ComponentProps<typeof StreetView>
    >;
    for (const b of all.props.street.buildings) {
      const view = find(await SitePage(params('self', { b: b.id })), BuildingView)!;
      expect(bannedIn(visibleText(renderToStaticMarkup(view))), b.name).toEqual([]);
    }
  });

  it('is not found for an unknown or malformed site id', async () => {
    await expect(SitePage(params('no-such-site'))).rejects.toThrow(notFound);
    await expect(SitePage(params('../etc'))).rejects.toThrow(notFound);
  });
});

describe('route /site/[siteId]/discovery', () => {
  const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
  const serverUrl = process.env.DATABASE_URL!;
  const original = process.env.DATABASE_URL;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    process.env.DATABASE_URL = Object.assign(new URL(serverUrl), {
      pathname: `/${dbName}`,
    }).toString();
    const conn = createDb();
    await runMigrations(conn.db);
    await seed(conn.db, { memberName: 'Asha Rao' });
    await startSession(conn.db, 'self', {
      title: 'Kick-off',
      reconstructed: true,
      source: 'a log',
      createdBy: 'rama:test@0',
    });
    await conn.close();
  });

  afterAll(async () => {
    process.env.DATABASE_URL = original;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  });

  it("shows the site's sessions and decision cards as recorded, and the member it records as", async () => {
    const el = inner(await Discovery(params('self'))) as ReactElement<
      ComponentProps<typeof DiscoveryView>
    >;
    expect(el.type).toBe(DiscoveryView);
    expect(el.props.sessions.map((s) => [s.title, s.reconstructed, s.source])).toEqual([
      ['Kick-off', true, 'a log'],
    ]);
    expect(el.props.decisions).toEqual([]);
    expect(el.props.screens.length).toBeGreaterThan(0);
  });

  it('says the database could not be reached rather than showing an empty office', async () => {
    const url = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://rama:rama@127.0.0.1:1/none';
    try {
      expect(renderToStaticMarkup(inner(await Discovery(params('self'))))).toContain(
        'could not be reached',
      );
    } finally {
      process.env.DATABASE_URL = url;
    }
  });

  it('is not found for an unknown site', async () => {
    await expect(Discovery(params('nope'))).rejects.toThrow(notFound);
  });
});
