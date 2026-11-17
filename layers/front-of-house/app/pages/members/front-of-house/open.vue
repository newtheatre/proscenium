<!-- Open shifts (Front of house specification, part 5, "Members' area"): published shifts with a
     place free, cover first, grouped by date. A shift the person cannot take is shown with why and
     what would let them, not hidden. Production and duty narrow the list. -->
<script setup lang="ts">
interface Unmet { ref: string, label: string }
interface OpenShift {
  id: string
  performanceId: string | null
  productionTitle: string | null
  title: string | null
  dutyId: string
  dutyName: string
  dutyDescription: string | null
  callAt: number
  endsAt: number
  placesFree: number
  coverFor: string | null
  eligible: boolean
  reasons: string[]
  unmet: Unmet[]
  overlaps: boolean
}

const { t, te } = useT()
const { dayNamed, time } = useDates()
const route = useRoute()
const router = useRouter()
const { data, status, error, refresh } = await useAPI<{ shifts: OpenShift[] }>('/api/front-of-house/open-shifts', { key: 'front-of-house:open-shifts' })

const production = computed({
  get: () => (route.query.production as string | undefined) ?? 'all',
  set: v => router.replace({ query: { ...route.query, production: v === 'all' ? undefined : v } }),
})
const duty = computed({
  get: () => (route.query.duty as string | undefined) ?? 'all',
  set: v => router.replace({ query: { ...route.query, duty: v === 'all' ? undefined : v } }),
})
const options = (pairs: [string, string][]) => [{ value: 'all', label: t('front-of-house.open-shifts.any') }, ...new Map(pairs).entries()].map(o => Array.isArray(o) ? { value: o[0], label: o[1] } : o)
const productions = computed(() => options((data.value?.shifts ?? []).filter(s => s.productionTitle).map(s => [s.productionTitle!, s.productionTitle!])))
const duties = computed(() => options((data.value?.shifts ?? []).map(s => [s.dutyId, s.dutyName])))

const shown = computed(() => (data.value?.shifts ?? []).filter(s => (production.value === 'all' || s.productionTitle === production.value) && (duty.value === 'all' || s.dutyId === duty.value)))
// Cover first, then by date; the server sends them in that order.
const groups = computed(() => {
  const out: { key: string, label: string, shifts: OpenShift[] }[] = []
  for (const s of shown.value) {
    const key = s.coverFor ? 'cover' : dayNamed(s.callAt)
    let group = out.find(g => g.key === key)
    if (!group) out.push(group = { key, label: s.coverFor ? t('front-of-house.open-shifts.cover-needed') : key, shifts: [] })
    group.shifts.push(s)
  }
  return out
})
const name = (s: OpenShift) => s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
// The requirement sources' own sentences where they gave them, else what is needed; then the way forward.
const why = (s: OpenShift) => [
  ...(s.eligible
    ? []
    : s.reasons.length
      ? s.reasons
      : [t('front-of-house.open-shifts.needs', { what: s.unmet.map(u => te(u.label) ? t(u.label) : u.label).join(', ') })]),
  ...(s.eligible ? [] : [t('front-of-house.open-shifts.needs-remedy')]),
  ...(s.overlaps ? [t('front-of-house.open-shifts.overlaps')] : []),
].join(' ')
const trail = computed(() => [{ label: t('front-of-house.navigation.shifts.label'), to: '/members/front-of-house' }])
</script>

<template>
  <PageFrame
    :title="t('front-of-house.open-shifts.title')"
    :trail="trail"
  >
    <div class="mb-6 flex flex-wrap gap-3">
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
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!shown.length"
        :title="t('front-of-house.open-shifts.empty.title')"
        :description="t('front-of-house.open-shifts.empty.description')"
        icon="i-lucide-calendar-clock"
        help="/account/notifications"
      />
      <div
        v-else
        class="space-y-6"
      >
        <PageSection
          v-for="g in groups"
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
              :description="t('front-of-house.open-shifts.row', { from: time(s.callAt), to: time(s.endsAt), count: s.placesFree })"
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
    </DataBoundary>
  </PageFrame>
</template>
