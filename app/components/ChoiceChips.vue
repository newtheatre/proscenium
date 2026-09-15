<script setup lang="ts">
// The discount and tab-holder pickers on the till are the same twenty lines twice
// (review-ui.md, "Splitting the till"): a chip per choice, plus a "none" chip.

const props = defineProps<{
  containerTestId: string
  label: string
  items: { id: string, label: string }[]
  noneLabel: string
  noneTestId: string
  itemTestPrefix: string
  modelValue: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

function testIdFor(id: string): string {
  return `${props.itemTestPrefix}-${id}`
}
</script>

<template>
  <div
    :data-test="containerTestId"
    class="space-y-2"
  >
    <p class="text-xs text-muted">
      {{ label }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        size="sm"
        :color="modelValue === null ? 'primary' : 'neutral'"
        :variant="modelValue === null ? 'solid' : 'subtle'"
        class="min-h-10"
        :data-test="noneTestId"
        @click="emit('update:modelValue', null)"
      >
        {{ noneLabel }}
      </UButton>
      <UButton
        v-for="item in items"
        :key="item.id"
        size="sm"
        :color="modelValue === item.id ? 'primary' : 'neutral'"
        :variant="modelValue === item.id ? 'solid' : 'subtle'"
        class="min-h-10"
        :data-test="testIdFor(item.id)"
        @click="emit('update:modelValue', item.id)"
      >
        {{ item.label }}
      </UButton>
    </div>
  </div>
</template>
