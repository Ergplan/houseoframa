import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** Sign in with a username and password (accounts are set in the server's environment, RAMA_ACCOUNTS). */
export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = (await searchParams) ?? {};
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
