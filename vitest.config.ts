import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

// Tests that call a real model vendor live in *.vendor.test.ts (tagged @vendor) and run only on request.
const vendorTests = process.env.RAMA_VENDOR_TESTS === '1';
const exclude = vendorTests ? [] : ['**/*.vendor.test.ts'];
const project = (name: string, root: string, include: string[], testTimeout = 10_000) => ({
  test: { name, root, include, exclude: [...exclude, '**/node_modules/**'], testTimeout },
});

export default defineConfig({
  test: {
    projects: [
      project('@rama/shared', 'packages/shared', ['src/**/*.test.ts']),
      project('@rama/db', 'packages/db', ['src/**/*.test.ts'], 30_000),
      project('@rama/model', 'packages/model', ['src/**/*.test.ts']),
      project('@rama/app', 'apps/rama', ['**/*.test.{ts,tsx}']),
      project('e2e', 'tests', ['**/*.e2e.test.ts'], 120_000),
    ],
  },
});
