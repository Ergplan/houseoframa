// Outside services: the jetties across the water. A file talks to a service when it imports the
// service's own package at run time, or writes the address of its interface in a string. Only services
// on these two lists (and any host whose name starts with `api.`) count: a link to a web page is not a
// conversation with an outside service.
import type { BrickNode } from '@rama/shared';

const BY_PACKAGE: Record<string, string> = {
  openai: 'OpenAI',
  '@anthropic-ai/sdk': 'Anthropic',
  stripe: 'Stripe',
  razorpay: 'Razorpay',
  resend: 'Resend',
  twilio: 'Twilio',
  '@sendgrid/mail': 'SendGrid',
  nodemailer: 'Email',
  '@supabase/supabase-js': 'Supabase',
  firebase: 'Firebase',
  'firebase-admin': 'Firebase',
  '@vercel/blob': 'Vercel Blob',
  '@octokit/rest': 'GitHub',
  octokit: 'GitHub',
};

const BY_HOST: Record<string, string> = {
  'api.openai.com': 'OpenAI',
  'api.anthropic.com': 'Anthropic',
  'api.github.com': 'GitHub',
  'api.stripe.com': 'Stripe',
  'api.razorpay.com': 'Razorpay',
  'api.resend.com': 'Resend',
  'api.twilio.com': 'Twilio',
};

/** The outside services one file talks to, by name, sorted. Tests talk to nothing. */
export function servicesOf(node: BrickNode): string[] {
  if (node.test) return [];
  const out = new Set<string>();
  for (const p of node.packages ?? []) {
    const name = BY_PACKAGE[p] ?? (p.startsWith('@aws-sdk/') ? 'AWS' : null);
    if (name) out.add(name);
  }
  for (const h of node.hosts ?? []) {
    if (h.endsWith('.test') || h.endsWith('.example') || h.endsWith('.local')) continue;
    const name = BY_HOST[h] ?? (h.startsWith('api.') ? h : null);
    if (name) out.add(name);
  }
  return [...out].sort();
}
