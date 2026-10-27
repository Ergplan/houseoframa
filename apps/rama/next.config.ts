import type { NextConfig } from 'next';

const config: NextConfig = {
  // The stage e2e test runs its own dev server beside `pnpm dev`; a separate distDir keeps them apart.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // `next dev` otherwise writes apps/rama/AGENTS.md and CLAUDE.md when it detects an agent. Project rules
  // live only in the root CLAUDE.md; the pointer to Next's bundled docs is in docs/DECISIONS.md.
  agentRules: false,
  // Workspace packages are TypeScript source (no build step between packages).
  transpilePackages: [
    '@rama/audit',
    '@rama/blueprint',
    '@rama/board',
    '@rama/ceremony',
    '@rama/db',
    '@rama/ears',
    '@rama/model',
    '@rama/shared',
    '@rama/stage',
    '@rama/trace',
    '@rama/workbench',
  ],
  // The extractor parses with the TypeScript compiler and talks to git: server-only, never bundled.
  serverExternalPackages: ['typescript', 'postgres', 'playwright'],
};

export default config;
