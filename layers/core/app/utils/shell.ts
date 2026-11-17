import type { InjectionKey, Ref } from 'vue'

/** Provided by a layout built on Nuxt UI's dashboard, so a page type knows to own its panel. */
export const DASHBOARD_SHELL: InjectionKey<boolean> = Symbol('core:dashboard-shell')

/**
 * Provided by the console: the module whose settings the cog at the end of the navbar opens, or
 * nothing when the page belongs to no module or the viewer may change none of its settings.
 */
export const CONSOLE_SETTINGS: InjectionKey<Ref<string | undefined>> = Symbol('core:console-settings')
