// Small helpers for form routes: the public address to send a browser back to, and a 303 to it.

/** The app's public address: RAMA_BASE_URL, else the request's own origin. */
export const baseUrlOf = (req: Request) =>
  (process.env.RAMA_BASE_URL || new URL(req.url).origin).replace(/\/$/, '');

/** A 303 back to a page of the app, with a plain sentence for it to show when there is one. */
export function back(base: string, page: string, said?: { ok: boolean; sentence: string }) {
  const url = new URL(page, `${base}/`);
  if (said) {
    url.searchParams.set(said.ok ? 'said' : 'error', said.sentence);
  }
  return new Response(null, { status: 303, headers: { location: url.toString() } });
}
