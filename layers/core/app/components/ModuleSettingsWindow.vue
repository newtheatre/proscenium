<!-- The console's settings window: a module's tabs from its page in Admin (pages of settings and
     set-up screens, record pages included), drawn in a window as wide as the settings cards so
     console staff use them without Admin. It opens from the cog at the end of a module's navbar, or
     any console address with ?settings=<module>; ?screen=<address in Admin> names the open tab's
     screen. The screen is the same page Admin draws, rendered here for that address. -->
<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { resolveEntry } from '../../shared/navigation'

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { nameOf } = useModuleWords()
const module = computed(() => typeof route.query.settings === 'string' ? route.query.settings : undefined)
const { tabs, status } = useModuleSettings(() => module.value)

// The open screen's address: ?screen, or the first tab (with the setting search asked for).
const screen = computed(() => {
  if (typeof route.query.screen === 'string' && route.query.screen.startsWith(`/admin/modules/${module.value}`)) return route.query.screen
  const first = tabs.value[0]?.to
  if (!first) return undefined
  return typeof route.query.setting === 'string' ? `${first}?setting=${encodeURIComponent(route.query.setting)}` : first
})
// A resolved address is what NuxtPage draws when it is not the address in the bar.
const resolved = computed(() => screen.value ? router.resolve(screen.value) as unknown as RouteLocationNormalizedLoaded : undefined)
const active = computed(() => resolved.value ? resolveEntry(tabs.value, resolved.value.path)?.to : undefined)
const items = computed(() => tabs.value.map(tab => ({ label: t(tab.label), value: tab.to, icon: tab.icon })))

const open = computed({
  get: () => module.value !== undefined,
  set: (value) => {
    if (!value) closeModuleWindow(route.query)
  },
})
// The open screen is always named in the address, so a screen that changes its own address keeps its place.
watch(screen, (value) => {
  if (import.meta.client && value && module.value && route.query.screen !== value) navigateTo({ query: { ...route.query, screen: value, setting: undefined } }, { replace: true })
}, { immediate: true })
const choose = (to: string | number) => navigateTo({ query: { ...route.query, screen: String(to), setting: undefined } })
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
        :model-value="active"
        :items="items"
        :content="false"
        variant="link"
        :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
        @update:model-value="choose"
      />
      <EmbeddedScreens
        v-if="resolved && active"
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
