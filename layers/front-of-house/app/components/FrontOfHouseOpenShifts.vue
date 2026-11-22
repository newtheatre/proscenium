<!-- Open shifts, the "Open" tab of Shifts (Front of house specification, part 5, "Members' area"):
     published shifts with a place free, cover first, grouped by date. A shift the person cannot take
     is shown with why and what would let them, not hidden. Production and duty narrow the list. -->
<script setup lang="ts">
interface Unmet { ref: string, label: string }
export interface OpenShift {
  id: string
  performanceId: string | null
  productionTitle: string | null
  title: string | null
  dutyId: string
  dutyName: string
  dutyDescription: string | null
  callAt: number
  endsAt: number
  curtainAt: number | null
  placesFree: number
  coverFor: string | null
  eligible: boolean
  reasons: string[]
  unmet: Unmet[]
  overlaps: boolean
  clash: { shiftId: string, dutyName: string, productionTitle: string | null, title: string | null, callAt: number, endsAt: number } | null
}

const props = defineProps<{ shifts: OpenShift[] }>()
const { t, te } = useT()
const { dayNamed, time, dateTime } = useDates()
const route = useRoute()
const router = useRouter()

const production = computed({
  get: () => (route.query.production as string | undefined) ?? 'all',
  set: v => router.replace({ query: { ...route.query, production: v === 'all' ? undefined : v } }),
})
const duty = computed({
  get: () => (route.query.duty as string | undefined) ?? 'all',
  set: v => router.replace({ query: { ...route.query, duty: v === 'all' ? undefined : v } }),
})
const options = (pairs: [string, string][]) => [{ value: 'all', label: t('front-of-house.open-shifts.any') }, ...new Map(pairs).entries()].map(o => Array.isArray(o) ? { value: o[0], label: o[1] } : o)
const productions = computed(() => options(props.shifts.filter(s => s.productionTitle).map(s => [s.productionTitle!, s.productionTitle!])))
const duties = computed(() => options(props.shifts.map(s => [s.dutyId, s.dutyName])))

const shown = computed(() => props.shifts.filter(s => (production.value === 'all' || s.productionTitle === production.value) && (duty.value === 'all' || s.dutyId === duty.value)))
// By date, one entry for each shift: a place needing cover is a badge on it, not a second listing.
const groups = computed(() => {
  const out: { key: string, label: string, shifts: OpenShift[] }[] = []
  for (const s of shown.value) {
    const key = dayNamed(s.callAt)
    let group = out.find(g => g.key === key)
    if (!group) out.push(group = { key, label: key, shifts: [] })
    group.shifts.push(s)
  }
  return out
})
// Call and finish, the curtain where there is one (a matinee and an evening look alike otherwise), then places.
const row = (s: OpenShift) => [
  t('front-of-house.open-shifts.range', { from: time(s.callAt), to: time(s.endsAt) }),
  ...(s.curtainAt !== null ? [t('front-of-house.open-shifts.curtain', { time: time(s.curtainAt) })] : []),
  ...(s.placesFree > 0 ? [t('front-of-house.open-shifts.places', { count: s.placesFree })] : []),
  ...(s.coverFor ? [t('front-of-house.open-shifts.cover-place')] : []),
].join(' · ')
const name = (s: { dutyName: string, productionTitle: string | null, title: string | null }) => s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
// The requirement sources' own sentences where they gave them, else what is needed; then the way forward.
const why = (s: OpenShift) => [
  ...(s.eligible
    ? []
    : s.reasons.length
      ? s.reasons
      : [t('front-of-house.open-shifts.needs', { what: s.unmet.map(u => te(u.label) ? t(u.label) : u.label).join(', ') })]),
  ...(s.eligible ? [] : [t('front-of-house.open-shifts.needs-remedy')]),
  ...(s.clash ? [t('front-of-house.open-shifts.overlaps', { shift: name(s.clash), when: dateTime(s.clash.callAt) })] : []),
].join(' ')
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="shifts.length"
      class="flex flex-wrap gap-3"
    >
      <UFormField :label="t('front-of-house.open-shifts.production')">
        <USelect
          v-model="production"
          :items="productions"
          value-key="value"
        />
      </UFormField>
      <UFormField :label="t('front-of-house.open-shifts.duty')">
        <USelect
          v-model="duty"
          :items="duties"
          value-key="value"
        />
      </UFormField>
    </div>
    <EmptyState
      v-if="!shown.length"
      :title="t('front-of-house.open-shifts.empty.title')"
      :description="t('front-of-house.open-shifts.empty.description')"
      icon="i-lucide-calendar-clock"
      help="/account/notifications"
    />
    <PageSection
      v-for="g in groups"
      v-else
      :key="g.key"
      :title="g.label"
    >
      <RecordList :label="g.label">
        <RecordListItem
          v-for="s in g.shifts"
          :key="s.id"
          :to="`/members/front-of-house/shifts/${encodeURIComponent(s.id)}`"
          icon="i-lucide-calendar-clock"
          :name="name(s)"
          :description="row(s)"
          :muted="!s.eligible || s.overlaps"
        >
          <StatusBadge
            v-if="s.coverFor"
            tone="warning"
            :label="t('front-of-house.open-shifts.cover')"
          />
          <template
            v-if="!s.eligible || s.overlaps"
            #below
          >
            <p class="text-sm text-muted">
              {{ why(s) }}
            </p>
          </template>
        </RecordListItem>
      </RecordList>
    </PageSection>
  </div>
</template>
