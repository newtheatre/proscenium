<!-- One row of a RecordList: a name with an optional icon and a line of description, then whatever
     the row ends with (a count, a badge, its actions). With `to`, the whole row is a link. -->
<script setup lang="ts">
import { NuxtLink } from '#components'

defineProps<{ to?: string, icon?: string, name?: string, description?: string, muted?: boolean }>()
const slots = defineSlots<{ default?: () => unknown, name?: () => unknown, description?: () => unknown }>()
</script>

<template>
  <li>
    <component
      :is="to ? NuxtLink : 'div'"
      :to="to"
      class="flex items-center gap-3 px-4 py-3"
      :class="[to && 'hover:bg-elevated/50', muted && 'text-muted']"
    >
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
  </li>
</template>
