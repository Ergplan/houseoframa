import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

// Tests that call a real model vendor live in *.vendor.test.ts (tagged @vendor) and run only on request.
const vendorTests = process.env.RAMA_VENDOR_TESTS === '1';
const exclude = vendorTests ? [] : ['**/*.vendor.test.ts', '**/*.vendor.e2e.test.ts'];
const project = (name: string, root: string, include: string[], testTimeout = 10_000) => ({
  test: { name, root, include, exclude: [...exclude, '**/node_modules/**'], testTimeout },
});

export default defineConfig({
  test: {
    projects: [
      project('@rama/shared', 'packages/shared', ['src/**/*.test.ts']),
      project('@rama/db', 'packages/db', ['src/**/*.test.ts'], 30_000),
      project('@rama/model', 'packages/model', ['src/**/*.test.ts']),
      project(
        '@rama/blueprint',
        'packages/blueprint',
        ['src/**/*.test.ts', 'test/**/*.test.ts'],
        60_000,
      ),
      project(
        '@rama/ceremony',
        'packages/ceremony',
        ['src/**/*.test.ts', 'test/**/*.test.ts'],
        120_000,
      ),
      project('@rama/audit', 'packages/audit', ['src/**/*.test.ts', 'test/**/*.test.ts'], 600_000),
      project('@rama/trace', 'packages/trace', ['src/**/*.test.ts', 'test/**/*.test.ts'], 120_000),
      project(
        '@rama/workbench',
        'packages/workbench',
        ['src/**/*.test.ts', 'test/**/*.test.ts'],
        600_000,
      ),
      project('@rama/app', 'apps/rama', ['**/*.test.{ts,tsx}']),
      project('e2e', 'tests', ['**/*.e2e.test.ts'], 120_000),
    ],
  },
});
