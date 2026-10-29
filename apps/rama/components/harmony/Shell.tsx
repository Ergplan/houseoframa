// The app's chrome in Harmony (design/harmony/README.md): the Sidebar (264px) with the wordmark and the
// places a person goes, and the TopBar with the breadcrumb in plain words and who is acting. A site's
// page puts the trainer console in the sidebar's place.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Member } from '@rama/db';
import { seesEverything } from '@rama/db';

export type Place = 'home' | 'testdrive' | 'settings' | 'campus';

/** The wordmark set in type: "House of" in ink, "Rama" in accent (no logo file is provided). */
export function Wordmark() {
  return (
    <Link href="/" className="eg-wordmark" style={{ textDecoration: 'none' }}>
      House of <i>Rama</i>
    </Link>
  );
}

function Nav({ here, member }: { here: Place | null; member: Member | null }) {
  const items: [Place, string, string][] = [
    ['home', 'Home', '/'],
    ['testdrive', 'Test drive', '/testdrive'],
    ...(member && seesEverything(member)
      ? ([
          ['settings', 'Settings', '/settings'],
          ['campus', 'Campus', '/campus'],
        ] as [Place, string, string][])
      : []),
  ];
  return (
    <nav className="eg-nav" aria-label="Places">
      {items.map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          className="eg-nav__item"
          {...(id === here ? { 'aria-current': 'page' as const } : {})}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Who is acting, and the way to switch person. */
function Who({ member }: { member: Member | null }) {
  // Signed out, a person sees only the home page, whose one call is "Who are you?".
  if (!member) return null;
  return (
    <div className="eg-account whoami">
      <div>
        <div className="eg-account__name">{member.name}</div>
        <div className="eg-account__meta">
          {member.role === 'trainer'
            ? 'Trainer'
            : member.role === 'customer'
              ? 'Customer'
              : member.role}
        </div>
      </div>
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="eg-btn eg-btn--ghost eg-btn--sm">
          Not you? Switch
        </button>
      </form>
    </div>
  );
}

/** The breadcrumb in plain words: the last part bold. */
export function Crumbs({ parts }: { parts: { label: string; href?: string }[] }) {
  return (
    <nav className="eg-crumbs" aria-label="Where you are">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? <span aria-hidden>› </span> : null}
          {i === parts.length - 1 ? (
            <b>{p.label}</b>
          ) : p.href ? (
            <Link href={p.href}>{p.label}</Link>
          ) : (
            p.label
          )}
        </span>
      ))}
    </nav>
  );
}

/** Sidebar, top bar and the page: the shell of every workbench screen. */
export function Shell({
  here,
  member,
  crumbs,
  side,
  wide,
  children,
}: {
  here: Place | null;
  member: Member | null;
  crumbs: { label: string; href?: string }[];
  /** Replaces the navigation in the sidebar (a site's trainer console). */
  side?: ReactNode;
  /** The sidebar steps aside, for a page that needs the width (the Build desk). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="eg-stage rama-stage">
      <div className={`eg-screen rama-screen${wide ? ' rama-screen--wide' : ''}`}>
        <aside className="eg-side" hidden={wide}>
          <div className="eg-brand">
            <Wordmark />
          </div>
          {side ?? <Nav here={here} member={member} />}
          <div className="eg-side__foot">
            <b>Built on trust</b>
            Every figure traced, every screen signed by name.
          </div>
        </aside>
        <main className="eg-main">
          <header className="eg-topbar">
            <Crumbs parts={crumbs} />
            <div className="eg-topbar__end">
              <Who member={member} />
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
