// The settings a browser may know, fetched once per page load and shared.
export interface PublicSetting { value: unknown, text?: string }

export function usePublicSettings() {
  return useAPI<Record<string, PublicSetting>>('/api/core/settings/public', { key: 'core:public-settings', default: () => ({}) })
}
