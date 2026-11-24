// What modules add to the public header beside the account menu: the names of their global
// components, pushed by a module's plugin and drawn by layouts/default.vue (docs/kit/interface.md).
export function usePublicHeaderItems() {
  return useState<string[]>('core:public-header-items', () => [])
}

export interface PublicMenuEntry { labelKey: string, to: string }
export interface PublicShape { frontPage: string | null, menu: PublicMenuEntry[], footer: PublicMenuEntry[] }

// What another module makes of the public site while a condition holds (C-71, C-72): a front page and
// menu and footer entries. Filled by that module before a page with the default layout renders; null until then.
export function usePublicShape() {
  return useState<PublicShape | null>('core:public-shape', () => null)
}
