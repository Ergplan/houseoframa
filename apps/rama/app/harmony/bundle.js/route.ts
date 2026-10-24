// ergOS Harmony's runtime (window.ErgOS: folder shapes, icons, Indian number formatting), served from
// its verbatim copy in design/harmony/components so there is one copy of it in the repository.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { homeDir } from '@rama/db';

export const dynamic = 'force-static';

export function GET() {
  const js = readFileSync(path.join(homeDir(), 'design/harmony/components/bundle.js'), 'utf8');
  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
