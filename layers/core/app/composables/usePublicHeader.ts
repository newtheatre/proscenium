// What modules add to the public header beside the account menu: the names of their global
// components, pushed by a module's plugin and drawn by layouts/default.vue (docs/kit/interface.md).
export function usePublicHeaderItems() {
  return useState<string[]>('core:public-header-items', () => [])
}
