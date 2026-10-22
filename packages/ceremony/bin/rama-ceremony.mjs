#!/usr/bin/env node
// The `rama-ceremony` command (and `rama gate`): loads the TypeScript source through tsx.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
