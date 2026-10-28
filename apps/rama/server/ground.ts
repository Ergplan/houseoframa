// The ground route's deps on the real records (Stage 11).
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readRows, rowsSource } from '@rama/workbench';
import type { GroundDeps } from '../app/api/site/[siteId]/ground/handler';
import { withDb } from './session';

export function groundDeps(): GroundDeps {
  return {
    blueprint: (site) => readSiteBlueprint(site),
    source: (site) => withDb((db) => rowsSource(site, db)),
    read: (url, table, offset) => readRows(url, table, offset),
  };
}
