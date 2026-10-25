import { expect, it } from 'vitest';
import { buildingCount, planned } from './plan';

it('counts the buildings on the plan', () => {
  expect(buildingCount(planned())).toBe(1);
  expect(buildingCount([])).toBe(0);
});
