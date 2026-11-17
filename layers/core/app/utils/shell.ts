import type { InjectionKey, Ref } from 'vue'

/** Provided by a layout built on Nuxt UI's dashboard, so a page type knows to own its panel. */
export const DASHBOARD_SHELL: InjectionKey<boolean> = Symbol('core:dashboard-shell')

/** Provided by the Admin layout, so a page's navbar starts with the Admin mark (R-33). */
export const ADMIN_SHELL: InjectionKey<boolean> = Symbol('core:admin-shell')

/**
 * Provided by the console: the module whose settings the cog at the end of the navbar opens, or
 * nothing when the page belongs to no module or the viewer may change none of its settings.
 */
export const CONSOLE_SETTINGS: InjectionKey<Ref<{ scope: string, name: string } | undefined>> = Symbol('core:console-settings')

/**
 * Provided round a screen drawn inside another frame: a tab of a module's page in Admin, or the
 * console's settings window. PageFrame then draws no panel or page header of its own, only a
 * heading row with the way back, the status and the primary action, then the page.
 */
export const EMBEDDED_FRAME: InjectionKey<boolean> = Symbol('core:embedded-frame')

/** Provided by the console's settings window round the screen it draws. */
export const CONSOLE_WINDOW: InjectionKey<boolean> = Symbol('core:console-window')
