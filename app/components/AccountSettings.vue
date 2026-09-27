<script setup lang="ts">
import { ACCOUNT_NAV } from '#shared/utils/site-nav'

// The shared shell for the account settings pages (K-127 criterion 3): a side list on wide screens,
// a horizontal strip below `lg`, both reading the same declaration as the account menu and footer.
defineProps<{ title: string, description?: string }>()

const links = ACCOUNT_NAV.map(entry => ({ label: entry.label, icon: entry.icon, to: entry.to }))

// A tenth of the grid wider than Nuxt UI's side list, so "Access requirements" is read whole at
// 1280 rather than truncated (issue 921's trap, issue 1342).
const COLUMNS = { left: 'lg:col-span-3', center: 'lg:col-span-7' }
</script>

<template>
  <UContainer :class="MEMBER_PAGE_WIDE">
    <UPage :ui="COLUMNS">
      <template #left>
        <UPageAside>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
            highlight
          />
        </UPageAside>
      </template>

      <UPageHeader
        :title="title"
        :description="description"
        :ui="MEMBER_PAGE_HEADER"
      />

      <!-- Scrolls sideways rather than shrinking, so each label is read whole on a phone. -->
      <div class="mt-4 overflow-x-auto lg:hidden">
        <UNavigationMenu
          :items="links"
          variant="link"
          highlight
          class="w-max min-w-full"
        />
      </div>

      <div class="mt-6">
        <slot />
      </div>
    </UPage>
  </UContainer>
</template>
