<!-- Settings history (settings build brief, Upkeep): every change to a setting, newest first, filtered
     by module, page and person, each with a Revert that goes back through the ordinary save. Needs
     the ability to view the audit trail. -->
<script setup lang="ts">
import type { SettingChange } from '../../components/SettingChanges.vue'

const { t, te } = useT()
const ALL = 'all'
const module = ref(ALL)
const page = ref(ALL)
const actor = ref(ALL)

const { data: index } = await useSettingsIndex()
const { data: recent } = await useAPI<{ changes: SettingChange[] }>('/api/core/settings/history', { key: 'core:settings-history:people' })

const modules = computed(() => [...new Set((index.value?.settings ?? []).map(s => s.module))].sort())
const moduleItems = computed(() => [
  { value: ALL, label: t('core.settings-history.all-modules') },
  ...modules.value.map(m => ({ value: m, label: te(`${m}.module.name`) ? t(`${m}.module.name`) : m })),
])
const pages = computed(() => {
  const seen = new Map<string, string>()
  for (const s of index.value?.settings ?? []) {
    const id = (s as { page?: string | null }).page
    if (id && (module.value === ALL || s.module === module.value)) seen.set(id, id)
  }
  return [...seen.keys()].sort()
})
const pageItems = computed(() => [
  { value: ALL, label: t('core.settings-history.all-pages') },
  ...pages.value.map(p => ({ value: p, label: te(`${p.split('.')[0]}.settings-pages.${p.split('.')[1]}`) ? t(`${p.split('.')[0]}.settings-pages.${p.split('.')[1]}`) : p })),
])
const people = computed(() => {
  const seen = new Map<string, string>()
  for (const c of recent.value?.changes ?? []) if (c.by) seen.set(c.by.id, c.by.name ?? t('core.settings-history.someone'))
  return [{ value: ALL, label: t('core.settings-history.everyone') }, ...[...seen].map(([value, label]) => ({ value, label }))]
})
watch(module, () => { page.value = ALL })

const query = computed(() => ({
  module: module.value === ALL ? undefined : module.value,
  page: page.value === ALL ? undefined : page.value,
  actor: actor.value === ALL ? undefined : actor.value,
}))
</script>

<template>
  <PageFrame
    :title="t('core.settings-history.title')"
    :description="t('core.settings-history.description')"
  >
    <div class="mb-6 flex flex-wrap gap-4">
      <UFormField :label="t('core.settings-history.filter-module')">
        <USelect
          v-model="module"
          :items="moduleItems"
          value-key="value"
          class="w-56"
        />
      </UFormField>
      <UFormField :label="t('core.settings-history.filter-page')">
        <USelect
          v-model="page"
          :items="pageItems"
          value-key="value"
          class="w-56"
        />
      </UFormField>
      <UFormField :label="t('core.settings-history.filter-person')">
        <USelect
          v-model="actor"
          :items="people"
          value-key="value"
          class="w-56"
        />
      </UFormField>
    </div>
    <SettingChanges :query="query" />
  </PageFrame>
</template>
