// A site page now returns its view inside SiteShell (an async component the static renderer cannot run).
// The view tests are about the view, so they take the shell's child.
import type { ReactElement } from 'react';

export const inner = (el: unknown): ReactElement =>
  (el as ReactElement<{ children: ReactElement }>).props.children;
