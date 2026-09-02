<script setup lang="ts">
import { Time } from '@internationalized/date'

// The one place that converts between the HH:MM strings the API speaks and the time value the
// input takes. A 24-hour clock, because every domain time here is London's wall clock (0014, 0032).

const model = defineModel<string | undefined>()

defineProps<{ disabled?: boolean }>()

// The value coming back is a time from Reka's own copy of the date library, so `instanceof` is
// false for one and discards it silently. Read the parts (0039).
function wallClock(next: unknown): string | undefined {
  const time = next as { hour?: unknown, minute?: unknown } | null | undefined
  if (typeof time?.hour !== 'number' || typeof time.minute !== 'number') return undefined
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${pad(time.hour)}:${pad(time.minute)}`
}

const value = computed({
  get(): Time | null {
    const [hour, minute] = (model.value ?? '').split(':').map(Number)
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
    if (hour! < 0 || hour! > 23 || minute! < 0 || minute! > 59) return null
    return new Time(hour!, minute!)
  },
  set(next: unknown) {
    model.value = wallClock(next)
  },
})
</script>

<template>
  <UInputTime
    v-model="value"
    locale="en-GB"
    :hour-cycle="24"
    granularity="minute"
    :disabled="disabled"
  />
</template>
