import type { SettingRef } from '../../shared/search'

/** Where each setting the viewer may open lives, fetched once and shared by the palette and the settings search. */
export function useSettingsIndex(options: { immediate?: boolean } = {}) {
  return useAPI<{ settings: SettingRef[] }>('/api/core/settings/index-search', { key: 'core:settings-index', lazy: true, default: () => ({ settings: [] }), server: false, immediate: options.immediate ?? true })
}
