// The words a person reads on a page, for the glossary check (rule 17), with the code itself left out
// (Stage 12): the Build desk shows the code being written beside the Street, at the member's word, and
// its lines are the code level's, not the Street's. Every label, sentence and English line around the
// code is still read and checked.
import type { Page } from 'playwright';

/** The page's text as a person reads it, without the lines of code in a code pane. */
export async function wordsOn(page: Page): Promise<string> {
  return page.locator('body').evaluate((b) => {
    const code = [...b.querySelectorAll<HTMLElement>('.code-block__lines')];
    const was = code.map((e) => e.style.display);
    code.forEach((e) => (e.style.display = 'none'));
    const text = (b as HTMLElement).innerText;
    code.forEach((e, i) => (e.style.display = was[i]!));
    return text;
  });
}
