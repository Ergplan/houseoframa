/** The key of one figure's appearance on one screen: runs and trails are kept per appearance. */
export const appearanceKey = (screen: string, figureId: string) => `${screen}/${figureId}`;
