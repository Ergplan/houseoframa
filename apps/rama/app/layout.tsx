import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
// ergOS Harmony (rule 17): the tokens, generated from design/harmony/tokens.json, then the component
// bundle copied verbatim from the design system, then House of Rama's own rules on top.
import './harmony-tokens.css';
import '../../../design/harmony/components/bundle.css';
import './globals.css';
import { HarmonyRuntime } from '../components/harmony/HarmonyRuntime';

export const metadata: Metadata = {
  title: 'House of Rama',
  description: 'Built on trust.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        {/* The pixel face is the Brick canvas's own, drawn only inside the canvas; Harmony's faces
            (Urbanist, JetBrains Mono) come with its bundle. Every face has a system fallback. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
        />
      </head>
      <body>
        {children}
        <Suspense>
          <HarmonyRuntime />
        </Suspense>
      </body>
    </html>
  );
}
