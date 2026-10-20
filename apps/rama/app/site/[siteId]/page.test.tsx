import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import SitePage from './page';
import Showroom from './showroom/page';
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

describe('routes /site/[siteId]/showroom and /discovery (stubs until Stages 3 and 4)', () => {
  it('say what will be there and when, and show nothing invented', async () => {
    const show = renderToStaticMarkup(await Showroom(params('self')));
    expect(show).toContain('Showroom · House of Rama');
    expect(show).toContain('Stage 3');
    const office = renderToStaticMarkup(await Discovery(params('self')));
    expect(office).toContain('Site office · House of Rama');
    expect(office).toContain('Stage 4');
  });

  it('are not found for an unknown site', async () => {
    await expect(Showroom(params('nope'))).rejects.toThrow(notFound);
    await expect(Discovery(params('nope'))).rejects.toThrow(notFound);
  });
});
