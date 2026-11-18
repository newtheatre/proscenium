<!-- A performance's wheelchair spaces (show walkthrough, decision 10; Matt 2026-11-17, 21:58), on its
     set-up: as its run has them (the run's layout or numbers, else its space's usual layout), or its
     own for this night, a layout of its space or numbers typed in. Below, how they stand: booked,
     the seats each takes, and the seats kept back for those not yet booked. -->
<script setup lang="ts">
import type { z } from 'zod'
import type { wheelchairChoice } from '../../server/input'

type Choice = z.input<typeof wheelchairChoice>
interface Layout { id: string, name: string, seats: number | null, wheelchairSpaces: number, seatsPerSpace: number, usual: boolean }
interface Said { layoutId: string | null, name: string | null, wheelchairSpaces: number, seatsPerSpace: number }
interface Shown {
  layouts: Layout[]
  layoutId: string | null
  own: Said | null
  inherited: (Said & { from: 'run' | 'usual' }) | null
  wheelchair: { spaces: number, booked: number, seatsEach: number, section: string | null, kept: number, keepUntil: number | null } | null
}

const props = defineProps<{ performanceId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { dateTime } = useDates()
const words = useWheelchairWords()
const url = computed(() => `/api/box-office/performances/${encodeURIComponent(props.performanceId)}/layout`)
const { data, refresh } = await useAPI<Shown>(url, { key: `box-office:layout:${props.performanceId}` })

const current = computed<Choice>(() => {
  const own = data.value?.own
  if (!own) return { use: 'inherit' }
  return own.layoutId ? { use: 'layout', layoutId: own.layoutId } : { use: 'numbers', wheelchairSpaces: own.wheelchairSpaces, seatsPerSpace: own.seatsPerSpace }
})
const inheritDescription = computed(() => {
  const i = data.value?.inherited ?? null
  return i?.from === 'usual' ? t('box-office.layouts.choice.usual-is', { what: words.arrangement(i) }) : words.arrangement(i)
})
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function use(choice: Choice) {
  await $api(url.value, { method: 'PUT', body: choice })
  await refresh()
  emit('changed')
}
async function save(choice: Choice) {
  const before = current.value
  refusal.value = null
  try {
    await use(choice)
    offer(t('box-office.layouts.choice.saved'), () => use(before))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const facts = computed(() => {
  const w = data.value?.wheelchair
  if (!w) return []
  return [
    { label: t('box-office.layouts.fact.spaces'), value: t('box-office.layouts.fact.booked', { booked: w.booked, spaces: w.spaces }) },
    { label: t('box-office.layouts.fact.each'), value: w.seatsEach ? t('box-office.layouts.seats', { count: w.seatsEach }) : t('box-office.layouts.fact.apart') },
    ...(w.seatsEach && w.keepUntil
      ? [{ label: t('box-office.layouts.fact.kept'), value: w.kept ? t('box-office.layouts.fact.kept-until', { seats: t('box-office.layouts.seats', { count: w.kept }), when: dateTime(w.keepUntil) }) : t('box-office.layouts.fact.none-kept') }]
      : []),
  ]
})
</script>

<template>
  <PageSection
    v-if="data"
    :title="t('box-office.layouts.performance.title')"
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
    <div class="space-y-4">
      <RefusalNotice :refusal="refusal" />
      <BoxOfficeWheelchairChoice
        :layouts="data.layouts"
        :current="current"
        :inherit-label="t('box-office.layouts.choice.as-run')"
        :inherit-description="inheritDescription"
        @save="save"
      />
      <FactStrip
        v-if="facts.length"
        :facts="facts"
      />
    </div>
  </PageSection>
</template>
