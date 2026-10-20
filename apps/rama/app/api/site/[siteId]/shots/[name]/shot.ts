import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { locateSite } from '@rama/blueprint/site';
import { captureDir } from '@rama/trace/showroom';

/** A captured screenshot of a site, by file name; nothing outside the site's shots/ is reachable. */
export function shotResponse(
  siteId: string,
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Response {
  if (!locateSite(siteId, env) || !/^[a-z0-9][a-z0-9-]{0,59}\.png$/.test(name))
    return new Response('not found', { status: 404 });
  const file = path.join(captureDir(siteId, env), 'shots', name);
  if (!existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file), {
    headers: { 'content-type': 'image/png', 'cache-control': 'no-cache' },
  });
}
