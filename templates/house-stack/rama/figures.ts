// Every figure the product shows (docs/HOUSE-STYLE.md): its function, imported from where it is written,
// and what it means in the customer's words. A screen shows a figure only through <Figure id>, and
// rama/lint.ts fails the build on any number shown any other way.
import { buildingCount } from '../features/welcome/plan';
import { defineFigures } from './define';

export const figures = defineFigures({
  'building-count': {
    fn: buildingCount,
    title: 'Buildings planned',
    what: 'How many things the product will do, as its plan lists them.',
    english: 'The number of buildings on the plan.',
    inputs: [{ label: 'The plan', source: 'buildingCount(buildings)', data: '.rama/features.json' }],
    show: 'count',
    files: ['.rama/features.json'],
  },
});
