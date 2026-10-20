import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'House of Rama',
  description: 'Built on trust.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#f6f3ee',
          color: '#1d1b18',
        }}
      >
        {children}
      </body>
    </html>
  );
}
