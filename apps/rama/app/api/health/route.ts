import { shortSha } from '../../../components/BuildStamp';

/** GET /api/health: the app is up, and which commit it runs ("unknown" when GIT_SHA is unset). */
export function GET() {
  return Response.json({ ok: true, commit: shortSha(process.env.GIT_SHA) ?? 'unknown' });
}
