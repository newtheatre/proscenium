<!-- A module's page in Admin: on a laptop and wider the list of modules down the left (none on a
     phone), then the module's name, its toggle, what it does and its tabs, which scroll sideways on
     a narrow screen. The tabs are the module's pages of settings, its set-up screens and About, as
     many as the viewer may open. The admin layout draws it round every page under the module's
     address, and the open tab's page in the slot, as an embedded screen. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { ModuleTabView, ModuleView } from '../utils/modules'
import { moduleHome, resolveEntry } from '../../shared/navigation'

const props = defineProps<{ module: string }>()
defineSlots<{ default?: () => unknown }>()

const { t, te } = useT()
const route = useRoute()
const { nameOf, descriptionOf } = useModuleWords()
const { data } = await useAPI<{ modules: ModuleView[], manage: boolean }>('/api/core/modules', { key: 'core:modules' })
const { data: tabData } = await useAPI<{ tabs: ModuleTabView[] }>(() => `/api/core/modules/${encodeURIComponent(props.module)}/tabs`, { key: `core:module-tabs:${props.module}` })
const { toggle, refusal, busy } = useModuleSwitch(() => data.value?.modules ?? [])

const view = computed(() => data.value?.modules.find(m => m.id === props.module))
const tabs = computed(() => tabData.value?.tabs ?? [])
const items = computed(() => tabs.value.map(tab => ({ label: te(tab.label) ? t(tab.label) : tab.label, value: tab.to, icon: tab.icon })))
// A record page below a tab's screen keeps that tab open.
const active = computed(() => resolveEntry(tabs.value, route.path)?.to)

const byName = (a: ModuleView, b: ModuleView) => a.id === 'core' ? -1 : b.id === 'core' ? 1 : nameOf(a.id).localeCompare(nameOf(b.id))
const side = computed<NavigationMenuItem[][]>(() => {
  const all = [...(data.value?.modules ?? [])].sort(byName)
  const link = (m: ModuleView): NavigationMenuItem => ({
    label: nameOf(m.id),
    icon: m.icon,
    to: m.open ?? moduleHome(m.id),
    active: m.id === props.module,
    badge: m.on && (m.missingSecrets.length || m.credentials.some(c => c.needed === 'always' && !c.set)) ? { icon: 'i-lucide-triangle-alert', color: 'warning', variant: 'subtle' } : undefined,
  })
  return [
    { label: t('core.modules.group.on'), list: all.filter(m => m.on && !m.alwaysOn) },
    { label: t('core.modules.group.available'), list: all.filter(m => !m.on && !m.alwaysOn) },
    { label: t('core.modules.group.always-on'), list: all.filter(m => m.alwaysOn) },
  ].filter(g => g.list.length).map(g => [{ label: g.label, type: 'label' as const }, ...g.list.map(link)])
})
</script>

<template>
  <div class="module-frame flex min-w-0 flex-1">
    <UDashboardPanel
      v-if="side.length"
      :ui="{ root: 'max-w-64 min-w-56 max-lg:hidden', body: 'p-2 sm:p-2' }"
    >
      <template #header>
        <UDashboardNavbar :title="t('core.modules.title')" />
      </template>
      <template #body>
        <UNavigationMenu
          :items="side"
          orientation="vertical"
          :aria-label="t('core.modules.title')"
        />
      </template>
    </UDashboardPanel>
    <PageFrame
      :title="nameOf(module)"
      :trail="[{ label: t('core.modules.title'), to: '/admin/modules' }]"
      width="reading"
    >
      <template #status>
        <StatusBadge
          v-if="view?.alwaysOn"
          tone="info"
          :label="t('core.modules.state.always-on')"
        />
        <UBadge
          v-if="view && view.stability !== 'stable'"
          :color="view.stability === 'deprecated' ? 'warning' : 'neutral'"
          variant="outline"
          :label="t(`core.modules.stability.${view.stability}`)"
        />
      </template>
      <template #primary>
        <USwitch
          v-if="view && data?.manage && !view.alwaysOn"
          :model-value="view.on"
          :label="t(view.on ? 'core.modules.state.on' : 'core.modules.state.off')"
          :loading="busy === view.id"
          :aria-label="t('core.modules.toggle', { module: nameOf(module) })"
          @update:model-value="toggle(view)"
        />
      </template>
      <p
        v-if="descriptionOf(module)"
        class="text-sm text-muted"
      >
        {{ descriptionOf(module) }}
      </p>
      <RefusalNotice :refusal="refusal" />
      <template v-if="view?.on">
        <UAlert
          v-for="name in view.missingSecrets"
          :key="name"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('core.modules.missing-secret', { name })"
        />
      </template>
      <UTabs
        v-if="items.length > 1"
        :model-value="active"
        :items="items"
        :content="false"
        variant="link"
        :aria-label="t('core.modules.tabs', { module: nameOf(module) })"
        :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
        @update:model-value="to => navigateTo(String(to))"
      />
      <EmbeddedScreens>
        <slot />
      </EmbeddedScreens>
    </PageFrame>
  </div>
</template>
