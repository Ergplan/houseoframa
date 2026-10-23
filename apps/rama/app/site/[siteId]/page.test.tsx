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
import { SiteView } from '../../../components/site/SiteView';

// A signed-in member who owns every site (authorization is tested in app/authz.test.tsx).
vi.mock('../../../server/session', async (orig) =>
  (await import('../../../test/session-mock')).sessionMock(await orig()),
);

const params = (siteId: string) => ({ params: Promise.resolve({ siteId }) });
const notFound = /NEXT_HTTP_ERROR_FALLBACK;404/;

describe('route /site/[siteId]', () => {
  it("renders the site view over the site's Blueprint (self: blueprint/self.json)", async () => {
    const el = (await SitePage(params('self'))) as ReactElement<{
      blueprint: { repo: string; nodes: unknown[] };
      siteId: string;
    }>;
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(SiteView);
    const self = JSON.parse(
      readFileSync(new URL('../../../../../blueprint/self.json', import.meta.url), 'utf8'),
    );
    expect(el.props.siteId).toBe('self');
    expect(el.props.blueprint.repo).toBe('Ergplan/houseoframa');
    expect(el.props.blueprint.nodes).toHaveLength(self.nodes.length);
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
    const el = (await Discovery(params('self'))) as ReactElement<
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
      expect(renderToStaticMarkup(await Discovery(params('self')))).toContain(
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
