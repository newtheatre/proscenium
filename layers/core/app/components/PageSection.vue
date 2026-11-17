<!-- A titled part of a page: its heading, an optional line of explanation, actions beside the
     heading, the content, and an optional footer for the section's own buttons. Every page divides
     itself with this, so headings are one size and one level everywhere. -->
<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
defineSlots<{ default?: () => unknown, actions?: () => unknown, footer?: () => unknown }>()
const id = useId()
</script>

<template>
  <UCard
    as="section"
    :aria-labelledby="id"
    :ui="{ body: 'space-y-4' }"
  >
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1 basis-64">
          <h2
            :id="id"
            class="font-semibold text-highlighted"
          >
            {{ title }}
          </h2>
          <p
            v-if="description"
            class="text-sm text-muted"
          >
            {{ description }}
          </p>
        </div>
        <slot name="actions" />
      </div>
    </template>
    <slot />
    <template
      v-if="$slots.footer"
      #footer
    >
      <div class="flex flex-wrap items-center justify-end gap-3">
        <slot name="footer" />
      </div>
    </template>
  </UCard>
</template>
