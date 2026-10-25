import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import Welcome from './page';

it('shows the plan’s count of buildings as a traced figure', () => {
  const html = renderToStaticMarkup(<Welcome />);
  expect(html).toContain('data-rama-figure="building-count"');
  expect(html).toContain('data-rama-value="1"');
});
