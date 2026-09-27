<script setup lang="ts">
import { saysWhen } from '#shared/utils/when'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()
</script>

<template>
  <MyTile
    title="Recent notifications"
    to="/my/notifications"
    label="See all notifications"
    class="lg:col-span-2 sm:col-span-2"
  >
    <ul class="flex flex-col gap-3">
      <li
        v-for="item in summary.notifications"
        :key="item.id"
      >
        <!-- Words, not links: the whole tile is the link, and a link inside a link is two targets in one. -->
        <p class="text-sm">
          {{ item.title }}
        </p>
        <p class="text-xs text-muted">
          {{ saysWhen(item.createdAt) }}
        </p>
      </li>
    </ul>
  </MyTile>
</template>
