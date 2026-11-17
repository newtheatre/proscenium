<!-- My shifts (Front of house specification, part 5, "Members' area"): the person's coming shifts
     first, then past ones, with their hours this year at the top. "Find a shift" opens the open
     shifts. Each row opens the shift. -->
<script setup lang="ts">
interface MyShift { assignmentId: string, shiftId: string, state: string, performanceId: string | null, productionTitle: string | null, title: string | null, dutyName: string, callAt: number, endsAt: number, minutesWorked: number | null }
interface Mine { coming: MyShift[], past: MyShift[], minutesThisYear: number }

const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<Mine>('/api/front-of-house/me/shifts', { key: 'front-of-house:my-shifts' })

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
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame :title="t('front-of-house.navigation.shifts.label')">
        <template #primary>
          <UButton
            to="/members/front-of-house/open"
            icon="i-lucide-search"
            :label="t('front-of-house.my-shifts.find')"
          />
        </template>
        <div class="space-y-6">
          <FactStrip :facts="[{ label: t('front-of-house.my-shifts.this-year'), value: hours(d.minutesThisYear) }]" />
          <PageSection :title="t('front-of-house.my-shifts.coming')">
            <EmptyState
              v-if="!d.coming.length"
              :title="t('front-of-house.my-shifts.none-coming')"
              :description="t('front-of-house.my-shifts.none-coming-description')"
              icon="i-lucide-calendar-clock"
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
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
