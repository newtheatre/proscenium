<script setup lang="ts">
import { ACCOUNT_NAV } from '#shared/utils/site-nav'

// The shared shell for the three account pages (K-127 criterion 3): a side list on wide screens,
// a horizontal strip below `lg`, both reading the same declaration as the account menu and footer.
defineProps<{ title: string, description?: string }>()

const links = ACCOUNT_NAV.map(entry => ({ label: entry.label, icon: entry.icon, to: entry.to }))
</script>

<template>
  <UContainer class="max-w-5xl py-10">
    <UPage>
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
      />

      <UNavigationMenu
        :items="links"
        variant="link"
        highlight
        class="mt-4 overflow-x-auto lg:hidden"
      />

      <div class="mt-6">
        <slot />
      </div>
    </UPage>
  </UContainer>
</template>
