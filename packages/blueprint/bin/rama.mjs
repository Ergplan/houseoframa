#!/usr/bin/env node
// The `rama` CLI. Packages are TypeScript source, so the entry registers tsx before loading it.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
