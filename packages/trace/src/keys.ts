// Runs and trails are kept per appearance: one figure on one screen. A figure that appears twice on the
// same screen (from different arguments, say) is told apart by its occurrence: `home/order-total`, then
// `home/order-total~2`. Capture and the Showroom both key figures with appearanceKeys, so they agree.

export const appearanceKey = (screen: string, figureId: string, occurrence = 1) =>
  occurrence > 1 ? `${screen}/${figureId}~${occurrence}` : `${screen}/${figureId}`;

/** The key of each figure on a screen, in order. */
export function appearanceKeys(screen: string, figures: { id: string }[]): string[] {
  const seen = new Map<string, number>();
  return figures.map((f) => {
    const n = (seen.get(f.id) ?? 0) + 1;
    seen.set(f.id, n);
    return appearanceKey(screen, f.id, n);
  });
}
