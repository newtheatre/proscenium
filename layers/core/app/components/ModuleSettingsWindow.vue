<!-- The console's settings window: a module's pages of settings, the same tabs as its page in Admin,
     in a window as wide as the settings cards, so console staff change them without Admin. It opens
     from the cog at the end of a module's navbar, or any console address with ?settings=<module>. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const { nameOf } = useModuleWords()
const module = computed(() => typeof route.query.settings === 'string' ? route.query.settings : undefined)
const highlight = computed(() => typeof route.query.setting === 'string' ? route.query.setting : undefined)
const { tabs, status } = useModuleSettings(() => module.value)

const open = computed({
  get: () => module.value !== undefined,
  set: (value) => {
    if (value) return
    const { settings: _, setting: __, ...query } = route.query
    navigateTo({ query }, { replace: true })
  },
})
const active = ref<string>()
watch(tabs, (list) => {
  if (!list.some(tab => tab.page === active.value)) active.value = list[0]?.page ?? undefined
}, { immediate: true })
const items = computed(() => tabs.value.map(tab => ({ label: t(tab.label), value: tab.page!, icon: tab.icon })))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="module ? t('core.modules.window.title', { module: nameOf(module) }) : ''"
    :description="t('core.modules.window.description')"
    :ui="{ content: 'sm:max-w-3xl sm:h-[90vh]', body: 'space-y-4' }"
  >
    <template #body>
      <UTabs
        v-if="items.length > 1"
        v-model="active"
        :items="items"
        :content="false"
        variant="link"
        :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
      />
      <SettingsSections
        v-if="active"
        :key="active"
        :page="active"
        :highlight="highlight"
      />
      <EmptyState
        v-else-if="status !== 'pending'"
        icon="i-lucide-settings-2"
        :title="t('core.modules.window.none')"
      />
    </template>
  </UModal>
</template>
