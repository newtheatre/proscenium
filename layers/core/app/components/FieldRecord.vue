<!-- One record of a type (a venue, a file, a person), found by searching. It uses the type's
     `core.search-source` and `core.record-resolver`, as the command palette does, so a record reads the
     same here as everywhere. It takes and gives the record's id (null for none). A type nobody may
     search here falls back to the id itself. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

interface Found { id: string, title: string }
const props = defineProps<{ /** The record type, such as "core.venue". */ record: string, disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })

const { t } = useT()
const { $api } = useNuxtApp()
const { data: palette } = useAPI<{ sources: { record: string, route: string }[] }>('/api/core/palette', { key: 'core:palette', lazy: true, server: false, default: () => ({ sources: [], actions: [] }) })
const source = computed(() => palette.value?.sources.find(s => s.record === props.record))

const resolve = async (ids: string[]) => ids.length
  ? (await $api<{ records: Found[] }>('/api/core/records', { query: { type: props.record, ids: ids.join(',') } }).catch(() => ({ records: [] as Found[] }))).records
  : []

// The chosen record's title, so the control shows a name and not an id.
const chosen = ref<Found | null>(null)
watch([model, source], async ([id]) => {
  if (!id) chosen.value = null
  else if (chosen.value?.id !== id) chosen.value = (await resolve([id]))[0] ?? { id, title: id }
}, { immediate: true })

const term = ref('')
const found = ref<Found[]>([])
const searching = ref(false)
watchDebounced(term, async (q) => {
  found.value = []
  if (!source.value || q.trim().length < 2) return // not-policy: two letters before a search is sent
  searching.value = true
  try {
    const { ids } = await $api<{ ids: string[] }>(source.value.route, { query: { q } }).catch(() => ({ ids: [] as string[] }))
    const records = await resolve(ids)
    if (term.value === q) found.value = records
  }
  finally {
    searching.value = false
  }
}, { debounce: 250 }) // not-policy: a typing pause

const items = computed(() => {
  const all = chosen.value && !found.value.some(f => f.id === chosen.value!.id) ? [chosen.value, ...found.value] : found.value
  return all.map(f => ({ value: f.id, label: f.title }))
})
</script>

<template>
  <UFieldGroup v-if="source">
    <USelectMenu
      v-model:search-term="term"
      :model-value="model ?? undefined"
      :items="items"
      value-key="value"
      ignore-filter
      :loading="searching"
      :disabled="disabled"
      :placeholder="t('core.record-field.search')"
      class="min-w-64"
      @update:model-value="model = $event ?? null"
    />
    <UButton
      v-if="model"
      icon="i-lucide-x"
      color="neutral"
      variant="outline"
      :disabled="disabled"
      :aria-label="t('core.record-field.clear')"
      @click="model = null"
    />
  </UFieldGroup>
  <UInput
    v-else
    :model-value="model ?? ''"
    :disabled="disabled"
    class="max-w-md font-mono"
    @update:model-value="model = String($event) || null"
  />
</template>
