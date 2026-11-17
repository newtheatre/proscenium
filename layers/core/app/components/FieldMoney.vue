<!-- An amount of money, typed in the currency's major unit (pounds) and kept in its minor unit
     (pence), as the server keeps it. The currency is the theatre's unless one is given. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** An ISO 4217 code; the theatre's currency (core.locale.currency) when left out. */
  currency?: string
  /** The least and most allowed, in the minor unit. */
  min?: number
  max?: number
  disabled?: boolean
  /** Shows the plus and minus buttons; off where an amount is typed, such as a price list. */
  steppers?: boolean
}>(), { currency: undefined, min: 0, max: undefined, steppers: true })
const model = defineModel<number | null>({ default: null })

const { data: settings } = usePublicSettings()
const { language } = useDates()
const code = computed(() => props.currency ?? (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
const digits = computed(() => new Intl.NumberFormat(language.value, { style: 'currency', currency: code.value }).resolvedOptions().maximumFractionDigits ?? 2)
const scale = computed(() => 10 ** digits.value)
const major = computed({
  get: () => model.value === null || model.value === undefined ? null : model.value / scale.value,
  set: (v: number | null | undefined) => { model.value = v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * scale.value) },
})
</script>

<template>
  <UInputNumber
    v-model="major"
    :min="min / scale"
    :max="max === undefined ? undefined : max / scale"
    :step="1 / scale"
    :format-options="{ style: 'currency', currency: code }"
    :locale="language"
    :disabled="disabled"
    :increment="steppers"
    :decrement="steppers"
  />
</template>
