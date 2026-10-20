#!/usr/bin/env node
// The `rama-trace` command: loads the TypeScript source through tsx (packages are consumed as source).
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
