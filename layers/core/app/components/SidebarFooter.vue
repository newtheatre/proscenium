<!-- The foot of the console's and Admin's sidebar: View site and Documentation for everyone,
     an Admin link for anyone who holds an admin entry (in Admin itself, the way back to the console in its place, beneath Documentation either way), and the account menu, the one way
     between shells (UI-02). The documentation link is a placeholder until the screens have help pages
     of their own (core.help-page). -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const props = defineProps<{ collapsed?: boolean, /** Admin's own sidebar leaves out its own link. */ admin?: boolean }>()
const { t } = useT()
const { has } = useViewer()
const links = computed<NavigationMenuItem[]>(() => [
  // The site and Documentation always come first and the link to the other shell beneath them, so nothing swaps places.
  { label: t('core.sidebar.view-site'), icon: 'i-lucide-globe', to: '/' },
  { label: t('core.sidebar.documentation'), icon: 'i-lucide-book-open', to: 'https://github.com/newtheatre/proscenium/tree/next/docs', target: '_blank' },
  ...(props.admin && has('console') ? [{ label: t('core.admin.back-console'), to: '/console', icon: 'i-lucide-arrow-left' }] : []),
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
