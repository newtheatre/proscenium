<script setup lang="ts">
import { wholeFromTyped } from '#shared/utils/admin-forms'

// A whole number typed as text: NaN when the text is not one, so the form refuses -5 or 2.5
// rather than a number field clamping it to 1 or rounding it to 3 (0127).
defineOptions({ inheritAttrs: false })

const props = defineProps<{ placeholder?: string }>()
const value = defineModel<number | undefined>()

const shown = (held: number | undefined): string => (held === undefined || Number.isNaN(held) ? '' : String(held))
const text = ref(shown(value.value))

watch(value, (held) => {
  if (held === undefined && text.value.trim() === '') return
  if (Number.isNaN(held)) return
  if ((wholeFromTyped(text.value) ?? undefined) !== held) text.value = shown(held)
})

function typed(raw: string | number): void {
  text.value = String(raw)
  value.value = text.value.trim() === '' ? undefined : wholeFromTyped(text.value) ?? Number.NaN
}

const invalid = computed(() => value.value !== undefined && Number.isNaN(value.value))
</script>

<template>
  <UInput
    v-bind="$attrs"
    :model-value="text"
    :placeholder="props.placeholder"
    :color="invalid ? 'error' : undefined"
    :highlight="invalid"
    :aria-invalid="invalid || undefined"
    inputmode="numeric"
    autocomplete="off"
    @update:model-value="typed"
  />
</template>
