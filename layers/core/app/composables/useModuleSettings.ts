// The pages of settings of one module that the viewer may open: the tabs of its page in Admin that
// the console's settings window draws in place.
import type { ModuleTabView } from '../utils/modules'

export function useModuleSettings(module: () => string | undefined) {
  const { $api } = useNuxtApp()
  const { data, status } = useAsyncData(
    () => `core:module-settings:${module() ?? ''}`,
    async () => {
      const id = module()
      if (!id) return []
      const { tabs } = await $api<{ tabs: ModuleTabView[] }>(`/api/core/modules/${encodeURIComponent(id)}/tabs` as '/api/core/modules/:id/tabs')
      return tabs.filter(tab => tab.page)
    },
    { default: () => [] as ModuleTabView[] },
  )
  return { tabs: data, status }
}
