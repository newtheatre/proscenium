<script setup lang="ts">
import { penceFromTyped } from '#shared/utils/admin-forms'

// Pounds typed as text, held in pence: NaN when the text is not a sum of money, so the form's
// schema refuses it rather than a number field rounding or clamping it into another figure (0127).
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{ placeholder?: string }>(), { placeholder: '0.00' })
const pence = defineModel<number | undefined>()

const shown = (value: number | undefined): string =>
  (value === undefined || Number.isNaN(value) ? '' : (value / 100).toFixed(2))

const text = ref(shown(pence.value))

// A value set from outside (a reset, a default filled in) replaces the text; one this field
// emitted itself leaves what was typed alone.
watch(pence, (value) => {
  if (value === undefined && text.value.trim() === '') return
  if (Number.isNaN(value)) return
  if ((penceFromTyped(text.value) ?? undefined) !== value) text.value = shown(value)
})

function typed(raw: string | number): void {
  text.value = String(raw)
  pence.value = text.value.trim() === '' ? undefined : penceFromTyped(text.value) ?? Number.NaN
}

const invalid = computed(() => pence.value !== undefined && Number.isNaN(pence.value))
</script>

<template>
  <UInput
    v-bind="$attrs"
    :model-value="text"
    :placeholder="props.placeholder"
    :color="invalid ? 'error' : undefined"
    :highlight="invalid"
    :aria-invalid="invalid || undefined"
    inputmode="decimal"
    autocomplete="off"
    @update:model-value="typed"
  >
    <template #leading>
      <span
        class="text-muted"
        aria-hidden="true"
      >£</span>
    </template>
  </UInput>
</template>
