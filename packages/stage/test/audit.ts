// An audit of the stall, as the app shows one: a defect on the save, a note on the money.
import type { AuditView } from '@rama/audit/view';

export function stallAudit(): AuditView {
  return {
    report: {
      reportId: 'r1',
      vendor: 'openai',
      model: 'gpt-x',
      at: '2026-10-02T10:00:00Z',
      inputsHash: 'h',
      callId: 'c',
    },
    commit: 'c3',
    confirmations: [],
    counts: { defects: 1, notes: 1, passes: 6, bricks: 8 },
    runs: [],
    narration: [
      { part: 'discovery', text: 'A small stall.' },
      { part: 'verdict', text: 'One thing to fix before the keys.' },
    ],
    alterations: [],
    timeMachine: [],
    signoffs: [],
    builders: ['Rama Builder'],
    verdicts: {
      'app/page.tsx': 'pass',
      'db/orders.ts': 'pass',
      'db/save.ts': 'defect',
      'lib/ask.ts': 'pass',
      'app/new/page.tsx': 'pass',
      'lib/money.ts': 'note',
      'db/schema.ts': 'pass',
      'scripts/seed.ts': 'pass',
    },
    findings: [],
  };
}
