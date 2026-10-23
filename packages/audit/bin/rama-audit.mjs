#!/usr/bin/env node
// The `rama-audit` command: loads the TypeScript source through tsx.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
