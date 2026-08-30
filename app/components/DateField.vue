<script setup lang="ts">
import { CalendarDate, parseDate } from '@internationalized/date'

// The one place that converts between the YYYY-MM-DD strings the API speaks and the calendar value
// the input takes. British order, because every domain date here is London's (0014, 0032).

const model = defineModel<string | undefined>()

defineProps<{ disabled?: boolean }>()

const value = computed({
  get(): CalendarDate | null {
    if (!model.value) return null
    try {
      return parseDate(model.value)
    }
    catch {
      return null
    }
  },
  set(next: unknown) {
    model.value = next instanceof CalendarDate ? next.toString() : undefined
  },
})
</script>

<template>
  <UInputDate
    v-model="value"
    locale="en-GB"
    :disabled="disabled"
    icon="i-lucide-calendar"
  />
</template>
