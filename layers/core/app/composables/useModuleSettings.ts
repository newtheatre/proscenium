// The console's settings window for one scope: the cog on a console page (its navigation entry's
// id) or one module (an Admin address opened from the console, or a setting found by search). It
// holds the tabs of modules' pages in Admin that belong there: pages of settings and set-up screens,
// as far as the viewer may open them (About stays in Admin), and the window's name.
import type { ModuleTabView } from '../utils/modules'

export function useModuleSettings(scope: () => string | undefined) {
  const { $api } = useNuxtApp()
  const { data, status } = useAsyncData(
    () => `core:settings-window:${scope() ?? ''}`,
    async () => {
      const id = scope()
      if (!id) return { name: '', tabs: [] as ModuleTabView[] }
      return await $api<{ name: string, tabs: ModuleTabView[] }>('/api/core/settings-window', { query: { for: id } })
    },
    { default: () => ({ name: '', tabs: [] as ModuleTabView[] }) },
  )
  return { tabs: computed(() => data.value.tabs), name: computed(() => data.value.name), status }
}

let closing = false
/** The window is being closed on purpose: the next address without ?settings is not a screen in it changing its own. */
export function closeModuleWindow(query: Record<string, unknown>) {
  closing = true
  const { settings: _, screen: __, setting: ___, ...rest } = query
  return Promise.resolve(navigateTo({ query: rest as Record<string, string> }, { replace: true })).finally(() => { closing = false })
}
export const isClosingModuleWindow = () => closing
