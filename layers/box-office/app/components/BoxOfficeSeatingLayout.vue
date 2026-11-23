<!-- A performance's wheelchair spaces (show walkthrough, decision 10; Matt 2026-11-17, 21:58), on its
     set-up: as its run has them (the run's layout or numbers, else its space's usual layout), or its
     own for this night, a layout of its space or numbers typed in. It sits inside the page's form
     with no button of its own: the page's one Save reads `dirty` and calls `commit`, which answers
     with its undo. How the spaces stand is BoxOfficeWheelchairStanding, read from the same answer. -->
<script setup lang="ts">
import type { z } from 'zod'
import type { wheelchairChoice } from '../../server/input'

type Choice = z.input<typeof wheelchairChoice>
interface Layout { id: string, name: string, seats: number | null, wheelchairSpaces: number, seatsPerSpace: number, usual: boolean }
interface Said { layoutId: string | null, name: string | null, wheelchairSpaces: number, seatsPerSpace: number, seatsBandId: string | null }
interface Shown {
  layouts: Layout[]
  sections: { id: string, name: string }[]
  layoutId: string | null
  own: Said | null
  inherited: (Said & { from: 'run' | 'usual' }) | null
  wheelchair: { spaces: number, booked: number, seatsEach: number, section: string | null, kept: number, keepUntil: number | null, releasedAt: number | null, wouldKeepUntil: number | null } | null
}

const props = defineProps<{ performanceId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const words = useWheelchairWords()
const url = computed(() => `/api/box-office/performances/${encodeURIComponent(props.performanceId)}/layout`)
// Declared before the first await, as an exposure must be; each is read when asked for.
defineExpose({
  get dirty() { return dirty.value },
  get own() { return !!data.value?.own },
  commit: () => commit(),
})
const { data, refresh } = await useAPI<Shown>(url, { key: `box-office:layout:${props.performanceId}` })

const current = computed<Choice>(() => {
  const own = data.value?.own
  if (!own) return { use: 'inherit' }
  return own.layoutId ? { use: 'layout', layoutId: own.layoutId } : { use: 'numbers', wheelchairSpaces: own.wheelchairSpaces, seatsPerSpace: own.seatsPerSpace, ...(own.seatsBandId ? { seatsBandId: own.seatsBandId } : {}) }
})
const inheritDescription = computed(() => {
  const i = data.value?.inherited ?? null
  return i?.from === 'usual' ? t('box-office.layouts.choice.usual-is', { what: words.arrangement(i) }) : words.arrangement(i)
})

async function use(choice: Choice) {
  await $api(url.value, { method: 'PUT', body: choice })
  await refresh()
  emit('changed')
}
// For the page's one Save: saves what is chosen and answers with the act that puts it back.
const choice = useTemplateRef<{ pending: Choice | null }>('choice')
const dirty = computed(() => !!choice.value?.pending)
async function commit(): Promise<(() => Promise<void>) | null> {
  const next = choice.value?.pending
  if (!next) return null
  const before = current.value
  await use(next)
  return () => use(before)
}
</script>

<template>
  <FieldGroup
    v-if="data"
    :title="t('box-office.setup.own.wheelchair-title')"
    :description="t('box-office.layouts.performance.description')"
  >
    <template
      v-if="!data.layouts.length"
      #actions
    >
      <UButton
        :label="t('box-office.layouts.performance.manage')"
        to="/admin/modules/box-office/seating-layouts"
        color="neutral"
        variant="outline"
        size="sm"
      />
    </template>
    <BoxOfficeWheelchairChoice
      ref="choice"
      nested
      :layouts="data.layouts"
      :sections="data.sections"
      :current="current"
      :inherit-label="t('box-office.layouts.choice.as-run')"
      :inherit-description="inheritDescription"
    />
  </FieldGroup>
</template>
