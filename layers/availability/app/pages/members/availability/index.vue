<!-- My availability (S1, AV-04): the week to paint free, maybe or busy, or clear; a change for some
     dates (S3); what is asked of me; and my entries ahead. Days in view live in the address. -->
<script setup lang="ts">
import type { Entry } from '../../../composables/useMyAvailability'

const { t } = useT()
const dates = useDates()
const m = await useMyAvailability()
const { data, status, error, refresh, query, heading, tool, target, pending, saving, patternLabels } = m
const adding = ref(false)

const facts = computed(() => {
  const p = data.value?.profile
  return [
    { label: t('availability.mine.changed'), value: p?.changedAt ? dates.dateTime(p.changedAt) : t('availability.mine.never') },
    { label: t('availability.mine.checked-to'), value: p?.checkedTo ? dates.day(p.checkedTo) : t('availability.mine.not-checked') },
    { label: t('availability.mine.unmarked'), value: t(`availability.levels.${p?.unmarked ?? 'unknown'}`) },
  ]
})
const asking = computed(() => (data.value?.requests ?? []).filter(r => r.open && r.state !== 'withdrawn'))
const pendingPattern = computed(() => pending.value ? m.patternOn(pending.value.date)?.label ?? '' : null)

function when(e: Entry): string {
  const days = e.firstDate === e.lastDate ? dates.dayNamed(e.firstDate) : dates.range(e.firstDate, e.lastDate)
  const only = e.weekdays ? ` (${e.weekdays.map(w => t(`availability.weekdays.${w}`)).join(', ')})` : ''
  return `${days}${only}, ${e.from && e.until ? `${e.from} to ${e.until}` : t('availability.mine.all-day')}`
}
</script>

<template>
  <PageFrame
    :title="t('availability.mine.title')"
    :description="t('availability.mine.description')"
    width="full"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('availability.mine.add')"
        @click="adding = true"
      />
    </template>
    <template #toolbar>
      <div class="flex flex-wrap items-center gap-2">
        <IconButton
          icon="i-lucide-chevron-left"
          :label="t('availability.mine.earlier')"
          @click="m.move(-1)"
        />
        <UButton
          :label="t('availability.mine.today')"
          color="neutral"
          variant="outline"
          @click="m.go(undefined)"
        />
        <IconButton
          icon="i-lucide-chevron-right"
          :label="t('availability.mine.later')"
          @click="m.move(1)"
        />
        <h2
          class="me-auto text-lg font-semibold"
          aria-live="polite"
        >
          {{ heading }}
        </h2>
        <UButton
          to="/members/availability/patterns"
          icon="i-lucide-repeat"
          color="neutral"
          variant="ghost"
          :label="t('availability.mine.patterns')"
        />
        <UButton
          to="/members/availability/requests"
          icon="i-lucide-inbox"
          color="neutral"
          variant="ghost"
          :label="t('availability.asked.title')"
        />
        <UButton
          to="/members/availability/calendars"
          icon="i-lucide-calendar-plus"
          color="neutral"
          variant="ghost"
          :label="t('availability.mine.calendars')"
        />
        <UButton
          to="/members/availability/privacy"
          icon="i-lucide-eye"
          color="neutral"
          variant="ghost"
          :label="t('availability.privacy.title')"
        />
        <AvailabilityPaintTools
          v-model:tool="tool"
          v-model:target="target"
          :patterns="!!data?.patterns.length"
        />
      </div>
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-6">
          <UAlert
            v-for="r in asking"
            :key="r.id"
            :title="t('availability.mine.asked', { title: r.title, period: dates.range(r.from, r.to), due: dates.day(r.dueOn) })"
            :description="r.state === 'answered' ? t('availability.mine.asked-done') : t('availability.mine.asked-help')"
            :icon="r.state === 'answered' ? 'i-lucide-circle-check' : 'i-lucide-calendar-check'"
            :color="r.state === 'answered' ? 'neutral' : 'info'"
            variant="subtle"
            :actions="r.state === 'answered' ? [{ label: t('availability.mine.open-request'), color: 'neutral', variant: 'outline', to: `/members/availability/requests/${r.id}` }] : [{ label: t('availability.mine.this-is-right'), onClick: () => m.answer(r.id) }, { label: t('availability.mine.open-request'), color: 'neutral', variant: 'outline', to: `/members/availability/requests/${r.id}` }]"
          />
          <FactStrip
            :facts="facts"
            row
          />
          <div class="space-y-2">
            <p class="text-sm text-muted">
              {{ t('availability.mine.how') }}
            </p>
            <AvailabilityWeekGrid
              :days="d.days.filter(x => x.date >= query.from && x.date <= query.to)"
              :step="d.grid.step"
              :day-starts="d.grid.dayStarts"
              :today="d.today"
              :horizon="d.horizon"
              :patterns="patternLabels"
              :commitments="d.commitments"
              :readonly="saving"
              @paint="m.paint"
            />
            <AvailabilityLegend :commitments="Object.keys(d.commitments).length > 0" />
          </div>
          <PageSection
            :title="t('availability.mine.entries')"
            :description="t('availability.mine.entries-help')"
          >
            <EmptyState
              v-if="!d.exceptions.length"
              icon="i-lucide-calendar"
              :title="t('availability.mine.no-entries')"
            />
            <RecordList
              v-else
              flush
            >
              <RecordListItem
                v-for="e in d.exceptions"
                :key="e.id"
                :name="when(e)"
                :description="[t(`availability.levels.${e.level}`), e.reason, e.reason && e.reasonShared ? t('availability.mine.shared') : null, e.onBehalf ? t('availability.mine.on-behalf') : null].filter(Boolean).join(' · ')"
              >
                <template #trailing>
                  <IconButton
                    icon="i-lucide-trash-2"
                    :label="t('availability.mine.remove')"
                    @click="m.removeEntry(e.id)"
                  />
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
        <USlideover
          v-model:open="adding"
          :title="t('availability.entry.title')"
          :description="t('availability.entry.description')"
        >
          <template #body>
            <AvailabilityEntryForm
              :today="d.today"
              :horizon="d.horizon"
              :step="d.grid.step"
              @saved="adding = false; refresh()"
            />
          </template>
        </USlideover>
      </template>
    </DataBoundary>
    <AvailabilityPatternAsk
      :pattern="pendingPattern"
      @choose="m.choose"
      @dismiss="pending = null"
    />
  </PageFrame>
</template>
