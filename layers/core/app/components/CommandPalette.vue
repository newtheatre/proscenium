<!-- The command palette (UI-09), opened with Ctrl or Cmd K from anywhere in the console. It lists
     only screens the viewer may open (the navigation they were given), the common actions and
     settings they may use, and records through each module's search source. Records look the same
     whatever their type: a title, the type's name beside it, the type's own address. It works by
     keyboard alone: type, arrow, Enter. -->
<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { watchDebounced } from '@vueuse/core'
import { matchSettings } from '../../shared/search'

interface Palette {
  sources: { id: string, record: string, route: string }[]
  actions: { id: string, to: string, icon: string, labelKey: string, keywordsKey?: string }[]
}
interface Found { type: string, id: string, title: string, to?: string }

const { $api } = useNuxtApp()
const MOST_RESULTS = 8 // not-policy: a short list per group
const { t, te } = useT()
const open = ref(false)
const term = ref('')
const { data: navigation } = await useNavigation('console')
// Fetched when the palette is first opened, so a page that never opens it makes no extra requests.
const { data: settingsIndex, execute: loadSettings } = useSettingsIndex({ immediate: false })
const { data: palette, execute: loadPalette } = useAPI<Palette>('/api/core/palette', { key: 'core:palette', lazy: true, server: false, immediate: false, default: () => ({ sources: [], actions: [] }) })
let loaded = false
watch(open, (now) => {
  if (!now || loaded) return
  loaded = true
  void loadPalette()
  void loadSettings()
})

const records = ref<Found[]>([])
const searching = ref(false)
watchDebounced(term, async (q) => {
  records.value = []
  const sources = palette.value?.sources ?? []
  if (q.trim().length < 2 || !sources.length) return // not-policy: two letters before a search is sent
  searching.value = true
  try {
    const out: Found[] = []
    for (const source of sources) {
      const { ids } = await $api<{ ids: string[] }>(source.route, { query: { q } }).catch(() => ({ ids: [] as string[] }))
      if (!ids.length) continue
      const { records: found } = await $api<{ records: Found[] }>('/api/core/records', { query: { type: source.record, ids: ids.join(',') } }).catch(() => ({ records: [] as Found[] }))
      out.push(...found)
    }
    // Only the latest question's answer is shown.
    if (term.value === q) records.value = out
  }
  finally {
    searching.value = false
  }
}, { debounce: 250 }) // not-policy: a typing pause

const typeName = (type: string) => te(`${type.split('.')[0]}.records.${type.split('.').slice(1).join('.')}`) ? t(`${type.split('.')[0]}.records.${type.split('.').slice(1).join('.')}`) : type

const groups = computed(() => {
  const screens = (navigation.value?.groups ?? []).flatMap(g => [...g.everyday, ...g.setup].map(i => ({
    id: `screen:${i.id}`, label: t(i.label), suffix: t(g.label), icon: i.icon, to: i.to,
  })))
  const actions = (palette.value?.actions ?? []).map(a => ({
    id: `action:${a.id}`, label: t(a.labelKey), suffix: a.keywordsKey ? t(a.keywordsKey) : undefined, icon: a.icon, to: a.to,
  }))
  const out: CommandPaletteGroup<CommandPaletteItem>[] = [
    { id: 'screens', label: t('core.palette.screens'), items: screens },
  ]
  if (actions.length) out.push({ id: 'actions', label: t('core.palette.actions'), items: actions })
  const settings = matchSettings(settingsIndex.value?.settings ?? [], term.value, t).slice(0, MOST_RESULTS)
  if (settings.length) out.push({ id: 'settings', label: t('core.palette.settings'), ignoreFilter: true, items: settings.map(s => ({ id: `setting:${s.key}`, label: s.label, suffix: s.help, icon: 'i-lucide-settings-2', to: s.to })) })
  if (records.value.length) {
    out.push({ id: 'records', label: t('core.palette.records'), ignoreFilter: true, items: records.value.slice(0, MOST_RESULTS).map(r => ({ id: `record:${r.type}:${r.id}`, label: r.title, suffix: typeName(r.type), icon: 'i-lucide-file-text', to: r.to })) })
  }
  return out
})
</script>

<template>
  <UDashboardSearch
    v-model:open="open"
    v-model:search-term="term"
    :groups="groups"
    :loading="searching"
    :title="t('core.palette.title')"
    :placeholder="t('core.palette.placeholder')"
    shortcut="meta_k"
    label-key="label"
  />
</template>
