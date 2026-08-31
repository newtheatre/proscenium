<script setup lang="ts">
import { CalendarDate, parseDate } from '@internationalized/date'

// The one place that converts between the YYYY-MM-DD strings the API speaks and the calendar value
// the input takes. British order, because every domain date here is London's (0014, 0032).

const model = defineModel<string | undefined>()

defineProps<{ disabled?: boolean }>()

const field = useTemplateRef('field')

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
    ref="field"
    v-model="value"
    locale="en-GB"
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
            class="p-2"
          />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
