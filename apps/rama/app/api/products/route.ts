import { newProduct } from '@rama/workbench';
import { authMember } from '../../../server/authorize';
import { authDeps } from '../../../server/auth-deps';
import { baseUrlOf } from '../../../server/http';
import { withDb } from '../../../server/session';
import { handleNewProduct } from './handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleNewProduct(await req.formData().catch(() => null), {
    member: () => authMember(req, authDeps()),
    newProduct: (input) =>
      withDb(async (db) => {
        const { site, flags } = await newProduct(db, input);
        return { siteId: site.id, flags };
      }),
    baseUrl: baseUrlOf(req),
  });
}
