// One project, "unit": the merge gate's workflow runs `vitest run --project unit` for its report.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    projects: [
      {
        oxc: { jsx: { runtime: 'automatic' } },
        test: { name: 'unit', include: ['**/*.test.{ts,tsx}'], exclude: ['**/node_modules/**'] },
      },
    ],
  },
});
