import Link from 'next/link';
import { authMode, readMembers } from '@rama/db';

export const dynamic = 'force-dynamic';

const ROLE = { trainer: 'Trainer', customer: 'Customer' } as const;

/**
 * "Who are you?" (version 1, rule 11): a person picks their name from members.json and that name is who
 * acts. With AUTH_MODE=password (the floor edition) the username-and-password form is shown instead.
 */
export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = (await searchParams) ?? {};
  if (authMode() === 'members') {
    const members = readMembers();
    return (
      <main className="stub">
        <h1>Who are you?</h1>
        <p className="note">
          Pick your name. It goes on every decision, confirmation and signature you make here.
        </p>
        {q.failed ? <p role="alert">That name is not on the list of people.</p> : null}
        {members.length ? (
          <form action="/api/auth/pick" method="post" className="picker">
            {members.map((m) => (
              <button key={m.name} type="submit" name="name" value={m.name} className="person">
                <b>{m.name}</b> <small>{ROLE[m.role]}</small>
              </button>
            ))}
          </form>
        ) : (
          <p role="alert">
            Nobody is on the list of people yet. The builder adds names to the members list.
          </p>
        )}
      </main>
    );
  }
  return (
    <main className="stub">
      <h1>Sign in · House of Rama</h1>
      {q.failed ? <p role="alert">That username and password do not match an account.</p> : null}
      <form action="/api/auth/login" method="post" className="login">
        <label>
          Username <input name="username" autoComplete="username" required />
        </label>
        <label>
          Password{' '}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="primary">
          Sign in
        </button>
      </form>
      <p>
        <Link href="/">◀ Home</Link>
      </p>
    </main>
  );
}
