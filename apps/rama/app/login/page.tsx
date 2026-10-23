import Link from 'next/link';
import { LoginForm } from '../../components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = (await searchParams) ?? {};
  return (
    <main className="stub">
      <h1>Sign in · House of Rama</h1>
      {q.expired ? <p role="alert">That link is used or expired. Ask for a new one.</p> : null}
      <p>No password: we mail you a link.</p>
      <LoginForm />
      <p>
        <Link href="/">◀ Home</Link>
      </p>
    </main>
  );
}
