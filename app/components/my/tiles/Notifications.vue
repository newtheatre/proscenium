<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()
</script>

<template>
  <MyTile
    title="Recent notifications"
    to="/account/notifications"
    label="See all notifications"
    :empty="summary.notifications.length === 0"
    empty-title="Nothing new"
    class="lg:col-span-2 sm:col-span-2"
  >
    <ul class="flex flex-col gap-3">
      <li
        v-for="item in summary.notifications"
        :key="item.id"
      >
        <component
          :is="item.link ? 'ULink' : 'p'"
          :to="item.link ?? undefined"
          class="text-sm"
        >
          {{ item.title }}
        </component>
        <p class="text-xs text-muted">
          {{ formatLondon(new Date(item.createdAt * 1000), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
        </p>
      </li>
    </ul>
  </MyTile>
</template>
