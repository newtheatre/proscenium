// The tabs of one module's page in Admin that the console's settings window draws: its pages of
// settings and its set-up screens, as far as the viewer may open them (About stays in Admin).
import type { ModuleTabView } from '../utils/modules'

export function useModuleSettings(module: () => string | undefined) {
  const { $api } = useNuxtApp()
  const { data, status } = useAsyncData(
    () => `core:module-settings:${module() ?? ''}`,
    async () => {
      const id = module()
      if (!id) return []
      const { tabs } = await $api<{ tabs: ModuleTabView[] }>(`/api/core/modules/${encodeURIComponent(id)}/tabs` as '/api/core/modules/:id/tabs')
      return tabs.filter(tab => !tab.id.startsWith('core.modules.about.'))
    },
    { default: () => [] as ModuleTabView[] },
  )
  return { tabs: data, status }
}

let closing = false
/** The window is being closed on purpose: the next address without ?settings is not a screen in it changing its own. */
export function closeModuleWindow(query: Record<string, unknown>) {
  closing = true
  const { settings: _, screen: __, setting: ___, ...rest } = query
  return Promise.resolve(navigateTo({ query: rest as Record<string, string> }, { replace: true })).finally(() => { closing = false })
}
export const isClosingModuleWindow = () => closing
