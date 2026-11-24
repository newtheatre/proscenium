<!-- Shifts (Front of house specification, part 5, "Members' area"): one page with two tabs. "My
     shifts" has the person's coming shifts first, then past ones, with their hours this year at the
     top; "Open shifts" has what they could take. Someone with nothing coming up lands on Open. -->
<script setup lang="ts">
import type { OpenShift } from '../../../components/FrontOfHouseOpenShifts.vue'

interface MyShift { assignmentId: string, shiftId: string, state: string, performanceId: string | null, productionTitle: string | null, title: string | null, dutyName: string, callAt: number, endsAt: number, minutesWorked: number | null }
interface Mine { coming: MyShift[], givenUp: MyShift[], past: MyShift[], minutesThisYear: number }

const { t } = useT()
const { dateTime } = useDates()
const route = useRoute()
const router = useRouter()
const [{ data, status, error, refresh }, { data: open, refresh: refreshOpen }] = await Promise.all([
  useAPI<Mine>('/api/front-of-house/me/shifts', { key: 'front-of-house:my-shifts' }),
  useAPI<{ shifts: OpenShift[] }>('/api/front-of-house/open-shifts', { key: 'front-of-house:open-shifts', default: () => ({ shifts: [] }) }),
])

// The tab is in the address, so a link (an email's "See open shifts") lands on the right one.
const view = computed({
  get: () => route.query.view === 'open' || route.query.view === 'mine' ? route.query.view : data.value?.coming.length ? 'mine' : 'open',
  set: v => router.replace({ query: { ...route.query, view: v, production: undefined, duty: undefined } }),
})
const tabs = computed(() => [
  { value: 'mine', label: t('front-of-house.my-shifts.tab'), icon: 'i-lucide-calendar-check' },
  { value: 'open', label: t('front-of-house.open-shifts.title'), icon: 'i-lucide-calendar-search', badge: open.value?.shifts.length || undefined },
])

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  requested: 'info', confirmed: 'success', checked_in: 'success', release_requested: 'warning',
  worked: 'neutral', no_show: 'danger', released: 'neutral', removed: 'neutral', cancelled: 'neutral',
}
const name = (s: MyShift) => s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
const hours = (minutes: number) => t('front-of-house.hours.count', { count: Math.round(minutes / 6) / 10 }) // not-policy: hours to one decimal place
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh(); refreshOpen()"
  >
    <template #default="{ data: d }">
      <PageFrame :title="t('front-of-house.navigation.shifts.label')">
        <UTabs
          v-model="view"
          :items="tabs"
          :content="false"
          variant="link"
          class="mb-6 w-fit max-w-full"
        />
        <FrontOfHouseOpenShifts
          v-if="view === 'open'"
          :shifts="open?.shifts ?? []"
        />
        <div
          v-else
          class="space-y-6"
        >
          <FactStrip :facts="[{ label: t('front-of-house.my-shifts.this-year'), value: hours(d.minutesThisYear) }]" />
          <PageSection :title="t('front-of-house.my-shifts.coming')">
            <EmptyState
              v-if="!d.coming.length"
              :title="t('front-of-house.my-shifts.none-coming')"
              :description="t('front-of-house.my-shifts.none-coming-description')"
              icon="i-lucide-calendar-clock"
              :action="{ label: t('front-of-house.my-shifts.find'), onClick: () => { view = 'open' } }"
            />
            <RecordList
              v-else
              :label="t('front-of-house.my-shifts.coming')"
            >
              <RecordListItem
                v-for="s in d.coming"
                :key="s.assignmentId"
                :to="`/members/front-of-house/shifts/${encodeURIComponent(s.shiftId)}`"
                icon="i-lucide-calendar-clock"
                :name="name(s)"
                :description="t('front-of-house.shift.call', { when: dateTime(s.callAt) })"
              >
                <StatusBadge
                  :tone="TONES[s.state] ?? 'neutral'"
                  :label="t(`front-of-house.assignment-states.${s.state}`)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.givenUp.length"
            :title="t('front-of-house.my-shifts.given-up')"
          >
            <RecordList :label="t('front-of-house.my-shifts.given-up')">
              <RecordListItem
                v-for="s in d.givenUp"
                :key="s.assignmentId"
                :to="`/members/front-of-house/shifts/${encodeURIComponent(s.shiftId)}`"
                :name="name(s)"
                :description="dateTime(s.callAt)"
                muted
              >
                <StatusBadge
                  :tone="TONES[s.state] ?? 'neutral'"
                  :label="t(`front-of-house.assignment-states.${s.state}`)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.past.length"
            :title="t('front-of-house.my-shifts.past')"
          >
            <RecordList :label="t('front-of-house.my-shifts.past')">
              <RecordListItem
                v-for="s in d.past"
                :key="s.assignmentId"
                :to="`/members/front-of-house/shifts/${encodeURIComponent(s.shiftId)}`"
                :name="name(s)"
                :description="[dateTime(s.callAt), s.minutesWorked !== null ? hours(s.minutesWorked) : null].filter(Boolean).join(' · ')"
                muted
              >
                <StatusBadge
                  :tone="TONES[s.state] ?? 'neutral'"
                  :label="t(`front-of-house.assignment-states.${s.state}`)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection :title="t('front-of-house.my-shifts.calendar.title')">
            <CalendarFeedPanel />
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
