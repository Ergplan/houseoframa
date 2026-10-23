// Sends a sign-in link. With SMTP_URL set (smtp[s]://user:pass@host:port) it is mailed from MAIL_FROM;
// without it (this machine, in development) the link is written to the server's log as the outbox, so a
// member at this machine can still sign in. The token is never logged when mail is configured.
import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function deliver(
  mail: Mail,
  env: NodeJS.ProcessEnv = process.env,
): Promise<'sent' | 'outbox'> {
  if (env.SMTP_URL) {
    const transport = nodemailer.createTransport(env.SMTP_URL);
    await transport.sendMail({
      from: env.MAIL_FROM ?? 'House of Rama <no-reply@localhost>',
      ...mail,
    });
    return 'sent';
  }
  console.log(`[outbox] to ${mail.to}: ${mail.subject}\n${mail.text}`);
  return 'outbox';
}

export const signInMail = (to: string, url: string, name: string): Mail => ({
  to,
  subject: 'Your House of Rama sign-in link',
  text: `${name},\n\nOpen this link to sign in to House of Rama. It works once, for 15 minutes:\n\n${url}\n\nIf you did not ask for it, ignore this mail.\n`,
});
