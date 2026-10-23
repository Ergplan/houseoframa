'use client';
// Asks for a sign-in link. The answer is the same whether or not the address belongs to a member.
import { useState } from 'react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        const res = await fetch('/api/auth/link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        }).catch(() => null);
        setState(res?.ok ? 'sent' : 'error');
      }}
    >
      <label>
        Email{' '}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>{' '}
      <button type="submit" disabled={state === 'busy'}>
        Send me a sign-in link
      </button>
      {state === 'sent' && (
        <p role="status">
          If that address belongs to a member, a link is on its way. It works once, for 15 minutes.
        </p>
      )}
      {state === 'error' && <p role="alert">The link could not be sent. Try again.</p>}
    </form>
  );
}
