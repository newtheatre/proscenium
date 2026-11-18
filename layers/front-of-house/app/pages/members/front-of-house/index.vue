<!-- My shifts (Front of house specification, part 5, "Members' area"): the person's coming shifts
     first, then past ones, with their hours this year at the top. "Find a shift" opens the open
     shifts. Each row opens the shift. -->
<script setup lang="ts">
interface MyShift { assignmentId: string, shiftId: string, state: string, performanceId: string | null, productionTitle: string | null, title: string | null, dutyName: string, callAt: number, endsAt: number, minutesWorked: number | null }
interface Mine { coming: MyShift[], givenUp: MyShift[], past: MyShift[], minutesThisYear: number }

const { t } = useT()
const { dateTime } = useDates()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Mine>('/api/front-of-house/me/shifts', { key: 'front-of-house:my-shifts' })

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  requested: 'info', confirmed: 'success', checked_in: 'success', release_requested: 'warning',
  worked: 'neutral', no_show: 'danger', released: 'neutral', removed: 'neutral', cancelled: 'neutral',
}
const name = (s: MyShift) => s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
// The private calendar feed: made the first time it is asked for, and replaceable.
const feed = ref<string | null>(null)
const feedRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function showFeed(reset: boolean) {
  feedRefusal.value = null
  try {
    feed.value = (await write<{ url: string }>(`/api/front-of-house/me/calendar${reset ? '/reset' : ''}`, { method: 'POST', body: {} })).url
    if (reset) toast.add({ title: t('front-of-house.my-shifts.calendar.reset-done'), color: 'success' })
  }
  catch (e) {
    feedRefusal.value = toRefusal(e)
  }
}
async function copyFeed() {
  if (!feed.value) return
  await navigator.clipboard.writeText(feed.value)
  toast.add({ title: t('front-of-house.my-shifts.calendar.copied'), color: 'success' })
}
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
            <div class="space-y-3">
              <p class="text-sm text-muted">
                {{ t('front-of-house.my-shifts.calendar.description') }}
              </p>
              <RefusalNotice :refusal="feedRefusal" />
              <UButton
                v-if="!feed"
                color="neutral"
                variant="outline"
                icon="i-lucide-calendar-sync"
                :label="t('front-of-house.my-shifts.calendar.show')"
                loading-auto
                @click="showFeed(false)"
              />
              <template v-else>
                <UFieldGroup class="w-full">
                  <UInput
                    :model-value="feed"
                    readonly
                    :aria-label="t('front-of-house.my-shifts.calendar.address')"
                  />
                  <UButton
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-copy"
                    :label="t('front-of-house.my-shifts.calendar.copy')"
                    @click="copyFeed"
                  />
                </UFieldGroup>
                <UButton
                  color="neutral"
                  variant="link"
                  :label="t('front-of-house.my-shifts.calendar.reset')"
                  loading-auto
                  @click="showFeed(true)"
                />
              </template>
            </div>
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
