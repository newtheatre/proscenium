// The time zone or the day start changed: queue the recalculation of stored operating days.
import { defineListener } from '#kit'

const DAY_SETTINGS = new Set(['core.locale.time-zone', 'core.locale.day-start'])

export default defineListener((event, unit) => {
  if (DAY_SETTINGS.has(event.payload.key as string)) unit.enqueue('core.recompute-days', {}, { dedupeKey: 'all' })
})
