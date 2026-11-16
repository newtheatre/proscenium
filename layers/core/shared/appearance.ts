// The colour mode lives in two cookies, so the server knows it before it renders and no page is
// drawn in one mode and corrected to another. MODE_KEY is the colour-mode module's own cookie.
// CHOSEN_KEY marks that the person picked the mode themselves, as opposed to the site owner's
// starting mode having been applied to them: the module stores a mode on a first visit too, so its
// cookie alone does not say who chose it.
export const MODE_KEY = 'nuxt-color-mode'
export const CHOSEN_KEY = 'proscenium-mode-chosen'
export const MODES = ['system', 'light', 'dark'] as const
export type Mode = typeof MODES[number]

/** How long the browser keeps both cookies, in seconds. */
export const MODE_COOKIE_AGE = 31_536_000 // not-policy: one year, the colour-mode module's own default

/**
 * The mode a request should be served in, or undefined to leave the browser's own cookie alone.
 * What a first-time visitor sees is the site owner's choice (core.appearance.default). A person's
 * own choice wins, unless the site owner has turned the choice off, when everyone gets the
 * starting mode.
 */
export function modeToApply(input: { start: unknown, mayChoose: boolean, stored: string | undefined, chosen: boolean }): Mode | undefined {
  const start = MODES.find(m => m === input.start)
  if (!start) return undefined
  if (input.chosen && input.mayChoose) return undefined
  return input.stored === start ? undefined : start
}
