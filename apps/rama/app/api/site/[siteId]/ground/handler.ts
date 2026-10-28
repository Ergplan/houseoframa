// The ground opened (Stage 11): GET ground?table=&offset= gives a page of a table's real rows, newest
// first, at most 50, read-only; or why there are none to show ("Rows not connected", the table not in
// that database yet). The rows come from the product's own sandbox database, or for an outside site from
// the read-only address entered in Settings; never from anywhere else.
import type { SiteLocation } from '@rama/blueprint/site';
import type { Blueprint, Table } from '@rama/shared';
import { countSentence, type GroundRows, type RowsSource } from '@rama/workbench';

export interface GroundDeps {
  blueprint: (site: SiteLocation) => Blueprint | null;
  source: (site: SiteLocation) => Promise<RowsSource>;
  read: (url: string, table: Table, offset: number) => Promise<GroundRows | { absent: true }>;
}

export type GroundPage =
  { connected: true; rows: GroundRows; count: string } | { connected: false; why: string };

/** A page of a table's rows, or why none can be shown; null when the site has no such table. */
export async function loadGround(
  site: SiteLocation,
  table: Table,
  offset: number,
  deps: GroundDeps,
): Promise<GroundPage> {
  const src = await deps.source(site);
  if (src.kind === 'none') return { connected: false, why: src.why };
  let r: GroundRows | { absent: true };
  try {
    r = await deps.read(src.url, table, offset);
  } catch (err) {
    return {
      connected: false,
      why: `Rows not connected: the database did not answer (${(err as Error).message.split('\n')[0]}).`,
    };
  }
  if ('absent' in r)
    return {
      connected: false,
      why: `The table ${table.name} is not in ${src.kind === 'sandbox' ? 'the product’s own database' : 'the database entered in Settings'} yet.`,
    };
  return { connected: true, rows: r, count: countSentence(table.name, r.total, r.today) };
}

const fail = (status: number, sentence: string) =>
  Response.json({ ok: false, sentence }, { status });

export async function handleGround(site: SiteLocation, url: URL, deps: GroundDeps) {
  const name = url.searchParams.get('table') ?? '';
  const raw = url.searchParams.get('offset') ?? '0';
  if (!/^\d{1,7}$/.test(raw)) return fail(400, 'expected ?offset= a whole number');
  const table = (deps.blueprint(site)?.tables ?? []).find((t) => t.name === name);
  if (!table) return fail(404, 'The product keeps no such table.');
  return Response.json({ ok: true, page: await loadGround(site, table, Number(raw), deps) });
}
