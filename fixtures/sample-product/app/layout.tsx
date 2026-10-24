import type { ReactNode } from 'react';

export const metadata = { title: 'Chai Stall' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 16, background: '#fffaf2' }}>
        <nav style={{ marginBottom: 16 }}>
          <a href="/">Orders</a> · <a href="/new">New order</a> · <a href="/total">Today’s total</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
