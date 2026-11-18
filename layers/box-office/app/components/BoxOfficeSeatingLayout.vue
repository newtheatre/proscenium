<!-- A performance's wheelchair spaces (show walkthrough, decision 10; Matt 2026-11-17, 21:58), on its
     set-up: as its run has them (the run's layout or numbers, else its space's usual layout), or its
     own for this night, a layout of its space or numbers typed in. Below, how they stand: booked,
     the seats each takes, and the seats kept back for those not yet booked. -->
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
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { dateTime } = useDates()
const { confirm } = useConfirm()
const words = useWheelchairWords()
const url = computed(() => `/api/box-office/performances/${encodeURIComponent(props.performanceId)}/layout`)
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

// Letting the kept seats go before the keep-back time, and Undo while spaces are still unbooked.
async function keep(path: 'release' | 'keep') {
  await $api(`${url.value}/${path}`, { method: 'POST', body: {} })
  await refresh()
  emit('changed')
}
async function release() {
  const w = data.value?.wheelchair
  if (!w) return
  if (!await confirm({ verb: t('box-office.layouts.release.verb'), thing: t('box-office.layouts.seats', { count: w.kept }), consequence: t('box-office.layouts.release.consequence') })) return
  refusal.value = null
  try {
    await keep('release')
    offer(t('box-office.layouts.release.done'), () => keep('keep'))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function keepBack() {
  refusal.value = null
  try {
    await keep('keep')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const canKeepAgain = computed(() => {
  const w = data.value?.wheelchair
  return !!w?.releasedAt && !!w.wouldKeepUntil && Date.now() < w.wouldKeepUntil && w.booked < w.spaces
})

const facts = computed(() => {
  const w = data.value?.wheelchair
  if (!w) return []
  return [
    { label: t('box-office.layouts.fact.spaces'), value: t('box-office.layouts.fact.booked', { booked: w.booked, spaces: w.spaces }) },
    { label: t('box-office.layouts.fact.each'), value: w.seatsEach ? t('box-office.layouts.seats', { count: w.seatsEach }) : t('box-office.layouts.fact.apart') },
    ...(w.seatsEach && w.section && data.value!.sections.length > 1 ? [{ label: t('box-office.layouts.fact.section'), value: w.section }] : []),
    ...(w.seatsEach && w.keepUntil
      ? [{ label: t('box-office.layouts.fact.kept'), value: w.kept ? t('box-office.layouts.fact.kept-until', { seats: t('box-office.layouts.seats', { count: w.kept }), when: dateTime(w.keepUntil) }) : t('box-office.layouts.fact.none-kept') }]
      : []),
    ...(w.seatsEach && w.releasedAt ? [{ label: t('box-office.layouts.fact.kept'), value: t('box-office.layouts.fact.released', { when: dateTime(w.releasedAt) }) }] : []),
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
        :sections="data.sections"
        :current="current"
        :inherit-label="t('box-office.layouts.choice.as-run')"
        :inherit-description="inheritDescription"
        @save="save"
      />
      <FactStrip
        v-if="facts.length"
        :facts="facts"
      />
      <div
        v-if="data.wheelchair?.kept || canKeepAgain"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-if="data.wheelchair?.kept"
          color="neutral"
          variant="outline"
          icon="i-lucide-lock-open"
          :label="t('box-office.layouts.release.button')"
          @click="release"
        />
        <UButton
          v-if="canKeepAgain"
          color="neutral"
          variant="outline"
          icon="i-lucide-lock"
          :label="t('box-office.layouts.release.keep')"
          @click="keepBack"
        />
      </div>
    </div>
  </PageSection>
</template>
