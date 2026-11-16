<!-- The foot of the console's and Site administration's sidebar: a Documentation link for everyone,
     a Site administration link for anyone who holds an admin entry (in Site administration itself, the way back to the console in its place), and the account menu, the one way
     between shells (UI-02). The documentation link is a placeholder until the screens have help pages
     of their own (core.help-page). -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const props = defineProps<{ collapsed?: boolean, /** Site administration's own sidebar leaves out its own link. */ admin?: boolean }>()
const { t } = useT()
const { has } = useViewer()
// Site administration's way out: back to the console, or to the site for someone with no console.
const back = computed(() => has('console')
  ? { label: t('core.admin.back-console'), to: '/console', icon: 'i-lucide-arrow-left' }
  : { label: t('core.admin.back-site'), to: '/', icon: 'i-lucide-arrow-left' })

const links = computed<NavigationMenuItem[]>(() => [
  ...(props.admin ? [back.value] : []),
  { label: t('core.sidebar.documentation'), icon: 'i-lucide-book-open', to: 'https://github.com/MattA-Official/proscenium/tree/next/docs', target: '_blank' },
  ...(has('admin') && !props.admin ? [{ label: t('core.menu.admin'), icon: 'i-lucide-shield-check', to: '/admin' }] : []),
])
</script>

<template>
  <div class="flex w-full flex-col gap-1">
    <UDashboardSearchButton
      :collapsed="collapsed"
      :label="t('core.palette.open')"
      color="neutral"
      variant="outline"
      class="sm:hidden"
    />
    <UNavigationMenu
      :items="links"
      orientation="vertical"
      :collapsed="collapsed"
      tooltip
      :aria-label="t('core.sidebar.links')"
    />
    <AccountMenu
      block
      :collapsed="collapsed"
    />
  </div>
</template>
