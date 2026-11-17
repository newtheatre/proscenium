<!-- The console's settings window: tabs from modules' pages in Admin (pages of settings and set-up
     screens, record pages included), drawn in a window as wide as the settings cards so console
     staff use them without Admin. The cog at the end of a page's navbar opens the tabs that belong to
     that page (?settings=<entry id>); an Admin address opened from the console, or a setting found by
     search, opens its module's (?settings=<module>). ?screen=<address in Admin> names the open
     tab's screen. The screen is the same page Admin draws, rendered here for that address. -->
<script setup lang="ts">
import { loadRouteLocation, type RouteLocationNormalizedLoaded } from 'vue-router'
import { resolveEntry } from '../../shared/navigation'

const { t } = useT()
const route = useRoute()
const router = useRouter()
const scope = computed(() => typeof route.query.settings === 'string' ? route.query.settings : undefined)
const { tabs, name, status } = useModuleSettings(() => scope.value)

// The open screen's address: ?screen, or the first tab (with the setting search asked for).
const screen = computed(() => {
  if (typeof route.query.screen === 'string' && route.query.screen.startsWith('/admin/modules/')) return route.query.screen
  const first = tabs.value[0]?.to
  if (!first) return undefined
  return typeof route.query.setting === 'string' ? `${first}?setting=${encodeURIComponent(route.query.setting)}` : first
})
// NuxtPage draws an address that is not the one in the bar once its page's code has loaded.
const resolved = shallowRef<RouteLocationNormalizedLoaded>()
const load = async (value: string | undefined) => value ? await loadRouteLocation(router.resolve(value)) : undefined
resolved.value = await load(screen.value)
watch(screen, async (value) => {
  resolved.value = await load(value)
})
const active = computed(() => resolved.value ? resolveEntry(tabs.value, resolved.value.path)?.to : undefined)
const items = computed(() => tabs.value.map(tab => ({ label: t(tab.label), value: tab.to, icon: tab.icon })))

const open = computed({
  get: () => scope.value !== undefined,
  set: (value) => {
    if (!value) closeModuleWindow(route.query)
  },
})
// The open screen is always named in the address, so a screen that changes its own address keeps its place.
watch(screen, (value) => {
  if (import.meta.client && value && scope.value && route.query.screen !== value) navigateTo({ query: { ...route.query, screen: value, setting: undefined } }, { replace: true })
}, { immediate: true })
const choose = (to: string | number) => navigateTo({ query: { ...route.query, screen: String(to), setting: undefined } })
</script>

<template>
  <UModal
    v-model:open="open"
    :title="name ? t('core.modules.window.title', { module: t(name) }) : ''"
    :description="t('core.modules.window.description')"
    :ui="{ content: 'sm:max-w-3xl sm:h-[90vh]', body: 'space-y-4' }"
  >
    <template #body>
      <UTabs
        v-if="items.length > 1"
        :model-value="active"
        :items="items"
        :content="false"
        variant="link"
        :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
        @update:model-value="choose"
      />
      <EmbeddedScreens
        v-if="resolved"
        window
      >
        <NuxtPage
          :key="resolved.fullPath"
          :route="resolved"
        />
      </EmbeddedScreens>
      <EmptyState
        v-else-if="status !== 'pending'"
        icon="i-lucide-settings-2"
        :title="t('core.modules.window.none')"
      />
    </template>
  </UModal>
</template>
