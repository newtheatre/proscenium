/**
 * Parent route for the account pages, with the navigation between them.
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
      label: 'Access requirements',
      icon: 'i-lucide-accessibility',
      to: '/account/access',
    },
    {
      label: 'Shifts',
      icon: 'i-lucide-clipboard-list',
      to: '/account/shifts',
    },
    {
      label: 'Security',
      icon: 'i-lucide-shield',
      to: '/account/security',
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
