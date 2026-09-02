<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import type { CalendarDate } from '@internationalized/date'

// The one place that converts between the YYYY-MM-DD strings the API speaks and the calendar value
// the input takes. British order, because every domain date here is London's (0014, 0032).

const model = defineModel<string | undefined>()

// A bound is a civil date like the model, so a caller never has to build a calendar value.
const props = defineProps<{ disabled?: boolean, min?: string, max?: string }>()

const bound = (value: string | undefined): CalendarDate | undefined => {
  if (!value) return undefined
  try {
    return parseDate(value)
  }
  catch {
    return undefined
  }
}

const field = useTemplateRef('field')

// The value coming back is a calendar date from Reka's own copy of the date library, so
// `instanceof` is false for one and discards it silently. Read the parts (0039).
function civilDate(next: unknown): string | undefined {
  const date = next as { year?: unknown, month?: unknown, day?: unknown } | null | undefined
  if (typeof date?.year !== 'number' || typeof date.month !== 'number' || typeof date.day !== 'number') {
    return undefined
  }
  const pad = (part: number, width: number): string => String(part).padStart(width, '0')
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`
}

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
    model.value = civilDate(next)
  },
})
</script>

<template>
  <UInputDate
    ref="field"
    v-model="value"
    locale="en-GB"
    :min-value="bound(props.min)"
    :max-value="bound(props.max)"
    :disabled="disabled"
  >
    <template #trailing>
      <UPopover :reference="field?.inputsRef?.at(-1)?.$el">
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-calendar"
          aria-label="Pick a date from a calendar"
          :disabled="disabled"
          class="px-0"
        />

        <template #content>
          <UCalendar
            v-model="value"
            :min-value="bound(props.min)"
            :max-value="bound(props.max)"
            class="p-2"
          />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
