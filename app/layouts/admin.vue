<template>
  <UDashboardGroup>
    <UDashboardSidebar
      resizable
      collapsible
      :min-size="12"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2">
          <ULink
            to="/"
          >
            <UColorModeImage
              v-if="!collapsed"
              light="/images/logos/anniversary-grey.png"
              dark="/images/logos/anniversary-white.png"
              alt="Nottingham New Theatre Logo"
              height="100"
            />
            <UIcon
              v-else
              name="i-heroicons-squares-2x2"
              class="size-8 text-primary mx-auto"
            />
          </ULink>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigation"
          orientation="vertical"
        />
      </template>
    </UDashboardSidebar>

    <!--
      Breathing room under the last element of every admin page — most visibly
      the pagination footer, which otherwise ends flush against the bottom edge.

      On the panel body rather than on AdminPage, because the two box-office
      pages do not use AdminPage and would have been missed.

      Both breakpoints are needed. The body's own classes are `p-4 sm:p-6`, and
      `sm:p-6` lives in a media-query block that comes after every base utility
      in the stylesheet — so a bare `pb-8` is overridden back to 24px above the
      `sm` breakpoint, which is every screen this is used on.
    -->
    <UDashboardPanel :ui="{ body: 'pb-8 sm:pb-10' }">
      <template #header>
        <UDashboardNavbar :title="route.meta.title as string || 'Admin'">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UColorModeButton />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { isAdminOrManager } from '~~/shared/utils/abilities'

const route = useRoute()
const { user } = useUserSession()

const isAdmin = computed(() =>
  user.value ? isAdminOrManager(user.value) : false,
)

const navigation = computed<NavigationMenuItem[][]>(() => {
  const sections: NavigationMenuItem[][] = []

  if (isAdmin.value) {
    sections.push([
      { type: 'label', label: 'Administration' },
      { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' },
      { label: 'Users', icon: 'i-lucide-users', to: '/admin/users' },
      { label: 'Venues', icon: 'i-lucide-building', to: '/admin/venues' },
      { label: 'Ticket Types', icon: 'i-lucide-ticket', to: '/admin/ticket-types' },
      { label: 'Passes', icon: 'i-lucide-credit-card', to: '/admin/passes' },
      { label: 'Shows', icon: 'i-lucide-calendar', to: '/admin/shows' },
      { label: 'Content Warnings', icon: 'i-lucide-triangle-alert', to: '/admin/content-warnings' },
      { label: 'Reservations', icon: 'i-lucide-bookmark-check', to: '/admin/reservations' },
    ])
  }

  sections.push([
    { type: 'label', label: 'Front of House' },
    {
      label: 'Box Office',
      icon: 'i-lucide-monitor-check',
      to: '/admin/box-office/reservations',
    },
  ])

  return sections
})
</script>
