<!-- A module's page in Admin (ModuleFrame) with one of its tabs open: a page of settings, drawn from
     the settings registry, or About. A set-up screen a module moves here is a page of its own at its
     tab's address. The module's address opens its first tab. -->
<script setup lang="ts">
import { moduleHome } from '../../../../../shared/navigation'
import type { ModuleTabView } from '../../../../utils/modules'

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
const page = (tabs: ModuleTabView[]) => tabs.find(tab => tab.to === route.path)?.page
</script>

<template>
  <ModuleFrame
    :key="module"
    v-slot="{ tabs, view }"
    :module="module"
  >
    <ModuleAbout
      v-if="about"
      :module="module"
      :view="view"
    />
    <template v-else>
      <SettingsSections
        v-if="page(tabs)"
        :key="route.path"
        :page="page(tabs)!"
        :highlight="highlight"
      />
      <EmptyState
        v-else
        icon="i-lucide-search-x"
        :title="t('core.modules.no-tab')"
      />
    </template>
  </ModuleFrame>
</template>
