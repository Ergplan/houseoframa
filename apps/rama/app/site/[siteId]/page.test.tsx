import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import SitePage from './page';
import Discovery from './discovery/page';
import { SiteView } from '../../../components/site/SiteView';

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

describe('route /site/[siteId]/discovery (stub until Stage 4)', () => {
  it('says what will be there and when, and shows nothing invented', async () => {
    const office = renderToStaticMarkup(await Discovery(params('self')));
    expect(office).toContain('Site office · House of Rama');
    expect(office).toContain('Stage 4');
  });

  it('is not found for an unknown site', async () => {
    await expect(Discovery(params('nope'))).rejects.toThrow(notFound);
  });
});
