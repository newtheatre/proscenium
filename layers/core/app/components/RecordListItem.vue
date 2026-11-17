<!-- One row of a RecordList: a name with an optional icon and a line of description, then whatever
     the row ends with (a count, a badge, its actions). The `leading` slot goes before the name, such as
     a drag handle. With `to`, the whole row is a link. What a
     row needs under it (a short form, a detail) goes in the `below` slot. -->
<script setup lang="ts">
import { NuxtLink } from '#components'

defineProps<{ to?: string, icon?: string, name?: string, description?: string, muted?: boolean }>()
const slots = defineSlots<{ default?: () => unknown, leading?: () => unknown, name?: () => unknown, description?: () => unknown, below?: () => unknown }>()
</script>

<template>
  <li>
    <component
      :is="to ? NuxtLink : 'div'"
      :to="to"
      class="flex items-center gap-3 px-4 py-3"
      :class="[to && 'hover:bg-elevated/50', muted && 'text-muted']"
    >
      <slot name="leading" />
      <UUser
        :name="name"
        :description="description"
        :avatar="icon ? { icon } : undefined"
        class="min-w-0 flex-1"
      >
        <template
          v-if="slots.name"
          #name
        >
          <slot name="name" />
        </template>
        <template
          v-if="slots.description"
          #description
        >
          <slot name="description" />
        </template>
      </UUser>
      <slot />
      <UIcon
        v-if="to"
        name="i-lucide-chevron-right"
        class="size-4 shrink-0 text-muted"
      />
    </component>
    <div
      v-if="slots.below"
      class="px-4 pb-3"
    >
      <slot name="below" />
    </div>
  </li>
</template>
