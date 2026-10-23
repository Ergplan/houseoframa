// Sign-in by email link (Stage 6), as functions of their dependencies so they are tested without a
// server. The link request answers the same whether or not the address belongs to a member.
import { z } from 'zod';
import type { Member } from '@rama/db';
import { SESSION_COOKIE } from '../../../server/session';

export interface AuthRouteDeps {
  issueLink: (email: string) => Promise<{ token: string; member: Member } | null>;
  redeemLink: (token: string) => Promise<{ sessionToken: string; member: Member } | null>;
  revokeSession: (token: string) => Promise<void>;
  deliver: (to: string, url: string, name: string) => Promise<unknown>;
  baseUrl: string;
  secure: boolean;
}

const cookie = (value: string, maxAgeSeconds: number, secure: boolean) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;

export async function handleLinkRequest(raw: unknown, deps: AuthRouteDeps): Promise<Response> {
  const body = z.object({ email: z.string().min(3).max(320) }).safeParse(raw);
  if (!body.success)
    return Response.json({ ok: false, error: 'expected {email}' }, { status: 400 });
  const link = await deps.issueLink(body.data.email);
  if (link) {
    await deps.deliver(
      link.member.email!,
      `${deps.baseUrl}/auth/verify?token=${encodeURIComponent(link.token)}`,
      link.member.name,
    );
  }
  return Response.json({ ok: true });
}

export async function handleVerify(url: URL, deps: AuthRouteDeps): Promise<Response> {
  const token = url.searchParams.get('token');
  const r = token ? await deps.redeemLink(token) : null;
  if (!r)
    return new Response(null, {
      status: 303,
      headers: { location: `${deps.baseUrl}/login?expired=1` },
    });
  return new Response(null, {
    status: 303,
    headers: {
      location: `${deps.baseUrl}/`,
      'set-cookie': cookie(r.sessionToken, 30 * 86_400, deps.secure),
    },
  });
}

export async function handleLogout(
  token: string | undefined,
  deps: AuthRouteDeps,
): Promise<Response> {
  if (token) await deps.revokeSession(token);
  return new Response(null, {
    status: 303,
    headers: { location: `${deps.baseUrl}/login`, 'set-cookie': cookie('', 0, deps.secure) },
  });
}
