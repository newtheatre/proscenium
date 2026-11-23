<!-- How a performance's wheelchair spaces stand, on its set-up: which arrangement is in force,
     how many are booked, the seats each takes, and the seats kept back for those not yet booked,
     which staff can put on sale early and keep back again. Nothing is drawn when it has none. -->
<script setup lang="ts">
interface Said { layoutId: string | null, name: string | null, wheelchairSpaces: number, seatsPerSpace: number, seatsBandId: string | null }
interface Shown {
  sections: { id: string, name: string }[]
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
// The same answer, under the same key, as the chooser in "This night differs from the run".
const { data, refresh } = await useAPI<Shown>(url, { key: `box-office:layout:${props.performanceId}` })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const arrangement = computed(() => {
  const d = data.value
  if (d?.own) return t('box-office.layouts.standing.own', { what: words.arrangement(d.own) })
  const i = d?.inherited ?? null
  return i?.from === 'usual' ? t('box-office.layouts.choice.usual-is', { what: words.arrangement(i) }) : words.arrangement(i)
})

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
    v-if="facts.length"
    :title="t('box-office.layouts.performance.title')"
    :description="arrangement"
  >
    <RefusalNotice :refusal="refusal" />
    <FactStrip :facts="facts" />
    <div
      v-if="data?.wheelchair?.kept || canKeepAgain"
      class="flex flex-wrap gap-2"
    >
      <UButton
        v-if="data?.wheelchair?.kept"
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
  </PageSection>
</template>
