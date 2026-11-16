import type { InjectionKey } from 'vue'

/** Provided by a layout built on Nuxt UI's dashboard, so a page type knows to own its panel. */
export const DASHBOARD_SHELL: InjectionKey<boolean> = Symbol('core:dashboard-shell')
