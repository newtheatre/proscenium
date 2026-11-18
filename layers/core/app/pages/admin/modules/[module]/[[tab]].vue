<!-- A tab of a module's page in Admin (the admin layout draws ModuleFrame round it): a page of
     settings, drawn from the settings registry, or About. A set-up screen a module puts here is a
     page of its own at its tab's address. The module's address opens its first tab. -->
<script setup lang="ts">
import { moduleHome } from '../../../../../shared/navigation'
import type { ModuleTabView, ModuleView } from '../../../../utils/modules'

// A different module is a different page; its tabs share one.
definePageMeta({ key: route => `module:${String(route.params.module)}` })

const { t } = useT()
const route = useRoute()
const module = computed(() => String(route.params.module))
const about = computed(() => route.params.tab === 'about')
const highlight = computed(() => typeof route.query.setting === 'string' ? route.query.setting : undefined)

// The module's address opens its first tab when that is not its page of settings (a module with none).
const { data } = await useAPI<{ tabs: ModuleTabView[] }>(() => `/api/core/modules/${encodeURIComponent(module.value)}/tabs`, { key: `core:module-tabs:${module.value}` })
const first = data.value?.tabs[0]
if (route.path === moduleHome(module.value) && first && first.to !== route.path) await navigateTo({ path: first.to, query: route.query }, { replace: true })
// "/settings" is where people expect a module's settings: when its page of settings lives at another address, go there.
const settingsTab = data.value?.tabs.find(tab => tab.page)
if (route.params.tab === 'settings' && !data.value?.tabs.some(tab => tab.to === route.path) && settingsTab) await navigateTo({ path: settingsTab.to, query: route.query }, { replace: true })
const page = computed(() => data.value?.tabs.find(tab => tab.to === route.path)?.page)
// Only About needs the catalogue's view (console staff in the settings window may not read it).
const { data: modules } = await useAPI<{ modules: ModuleView[] }>('/api/core/modules', { key: 'core:modules', immediate: about.value })
const view = computed(() => modules.value?.modules.find(m => m.id === module.value))
</script>

<template>
  <ModuleAbout
    v-if="about"
    :module="module"
    :view="view"
  />
  <SettingsSections
    v-else-if="page"
    :key="route.path"
    :page="page"
    :highlight="highlight"
  />
  <EmptyState
    v-else
    icon="i-lucide-search-x"
    :title="t('core.modules.no-tab')"
  />
</template>
