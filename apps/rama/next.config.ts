import type { NextConfig } from 'next';

const config: NextConfig = {
  // The stage e2e test runs its own dev server beside `pnpm dev`; a separate distDir keeps them apart.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // `next dev` otherwise writes apps/rama/AGENTS.md and CLAUDE.md when it detects an agent. Project rules
  // live only in the root CLAUDE.md; the pointer to Next's bundled docs is in docs/DECISIONS.md.
  agentRules: false,
};

export default config;
