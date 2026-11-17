<!-- One block on the shared calendar: its colour, an edge that matches its state and the state in
     words, so nothing rests on colour alone. A block with a record opens it. -->
<script setup lang="ts">
import type { CalendarItem } from './CalendarBoard.vue'

defineProps<{
  item: CalendarItem
  when: string
  edge: string
  /** One line, for the month and week grids. */
  compact?: boolean
}>()

const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="item.to ? NuxtLink : 'div'"
    :to="item.to"
    :class="[`calendar-${item.colour}`, edge]"
    class="block rounded-md border-2 border-(--cal-edge) bg-(--cal-fill) text-(--cal-text) hover:brightness-95"
  >
    <span
      v-if="compact"
      class="block px-1.5 py-0.5 text-xs break-words"
    >
      <span class="font-medium">{{ item.startsAt === undefined ? '' : `${when.split('–')[0]} ` }}</span>{{ item.title }}
      <span class="text-[0.6875rem] font-semibold uppercase"> · {{ item.state.label }}</span>
    </span>
    <span
      v-else
      class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2 py-1.5 text-sm"
    >
      <span class="min-w-0">
        <span class="block font-medium">{{ item.title }}</span>
        <span class="block text-xs">{{ when }}{{ item.detail ? ` · ${item.detail}` : '' }}</span>
      </span>
      <span class="text-xs font-semibold uppercase tracking-wide">{{ item.state.label }}</span>
    </span>
  </component>
</template>
