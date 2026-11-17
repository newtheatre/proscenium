<!-- A divider that folds away what is below it, such as archived records under a list: a line with
     its label and count in the middle, closed until opened. Nothing is drawn when the count is 0.
     The button alone is the control (a separator may hold no button), with lines either side. -->
<script setup lang="ts">
defineProps<{ label: string, count: number }>()
const open = defineModel<boolean>('open', { default: false })
const id = useId()
</script>

<template>
  <div v-if="count">
    <div class="flex items-center gap-2">
      <span
        class="flex-1 border-t border-default"
        aria-hidden="true"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        :label="`${label} (${count})`"
        :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :aria-expanded="open"
        :aria-controls="id"
        @click="open = !open"
      />
      <span
        class="flex-1 border-t border-default"
        aria-hidden="true"
      />
    </div>
    <div
      v-show="open"
      :id="id"
      class="pt-3"
    >
      <slot />
    </div>
  </div>
</template>
