<!-- One row of a RecordList: a name with an optional icon and a line of description, then whatever
     the row ends with (a count, a badge, its actions). The `leading` slot goes before the name, such as
     a drag handle. With `to`, the whole row is a link. What a
     row needs under it (a short form, a detail) goes in the `below` slot. On a narrow screen what the
     row ends with wraps under the name rather than squeezing it. `trailing` sits beside the link. -->
<script setup lang="ts">
import { NuxtLink } from '#components'

defineOptions({ inheritAttrs: false })
defineProps<{ to?: string, icon?: string, name?: string, description?: string, muted?: boolean, /** A fuller accessible name for the row's link than its visible words. */ label?: string, /** Where what the row ends with sits when the description runs to several lines: beside its middle, or level with the name. */ align?: 'center' | 'start' }>()
const slots = defineSlots<{ default?: () => unknown, leading?: () => unknown, name?: () => unknown, description?: () => unknown, below?: () => unknown, /** Beside the row's link and not inside it: a second link or a button on a row that is itself a link. */ trailing?: () => unknown }>()
</script>

<template>
  <li v-bind="$attrs">
    <div
      class="flex"
      :class="[align === 'start' ? 'items-start' : 'items-center', to && 'hover:bg-elevated/50', muted && 'text-muted']"
    >
      <component
        :is="to ? NuxtLink : 'div'"
        :to="to"
        :aria-label="to ? label : undefined"
        class="flex min-w-0 flex-1 gap-x-3 py-3 ps-4"
        :class="[align === 'start' ? 'items-start' : 'items-center', slots.trailing ? 'pe-2' : 'pe-4']"
      >
        <!-- What the row ends with wraps under the name on a narrow screen; the chevron never does. -->
        <div
          class="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-2"
          :class="align === 'start' ? 'items-start' : 'items-center'"
        >
          <slot name="leading" />
          <UUser
            :name="name"
            :description="description"
            :avatar="icon ? { icon } : undefined"
            class="min-w-0 flex-1 basis-40"
            :class="align === 'start' && 'items-start'"
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
        </div>
        <UIcon
          v-if="to && !slots.trailing"
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 text-muted"
          :class="align === 'start' && 'mt-1'"
        />
      </component>
      <div
        v-if="slots.trailing"
        class="flex shrink-0 items-center gap-2 pe-4"
        :class="align === 'start' && 'pt-2'"
      >
        <slot name="trailing" />
      </div>
    </div>
    <div
      v-if="slots.below"
      class="px-4 pb-3"
    >
      <slot name="below" />
    </div>
  </li>
</template>
