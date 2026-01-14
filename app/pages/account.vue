/**
 * Account Parent Page
 *
 * Parent route for account pages with navigation.
 * Uses the default layout and provides navigation between account sections.
 *
 * @route /account
 * @authenticated
 */
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({
  middleware: 'auth',
})

const navigation: NavigationMenuItem[][] = [
  [
    {
      label: 'Overview',
      icon: 'i-lucide-user',
      to: '/account',
      exact: true,
    },
    {
      label: 'Reservations',
      icon: 'i-lucide-ticket',
      to: '/account/reservations',
    },
    {
      label: 'Security',
      icon: 'i-lucide-shield',
      to: '/account/security',
    },
    {
      label: 'Notifications',
      icon: 'i-lucide-bell',
      to: '/account/notifications',
    },
  ],
]
</script>

<template>
  <UContainer class="py-8">
    <div class="flex flex-col lg:flex-row gap-8">
      <!-- Sidebar Navigation -->
      <aside class="lg:w-56 shrink-0">
        <UNavigationMenu
          :items="navigation"
          orientation="vertical"
          class="w-full"
        />
      </aside>

      <!-- Main Content -->
      <div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto">
        <NuxtPage />
      </div>
    </div>
  </UContainer>
</template>
