<!-- My availability (S1, AV-04): the week to paint free, maybe or busy, or clear; a change for some
     dates (S3); what is asked of me; and my entries ahead. Days in view live in the address. -->
<script setup lang="ts">
import { LEVELS, type ShownLevel } from '../../../../shared/levels'
import type { Entry } from '../../../composables/useMyAvailability'

const { t } = useT()
const dates = useDates()
const m = await useMyAvailability()
const { data, status, error, refresh, query, heading, tool, target, pending, saving, patternLabels } = m
const adding = ref(false)

const TOOLS = computed(() => [...LEVELS, 'clear' as const].map(value => ({ value, label: t(`availability.tools.${value}`) })))
const TARGETS = computed(() => [
  { value: 'days', label: t('availability.mine.target-days') },
  { value: 'pattern', label: t('availability.mine.target-pattern') },
])
const LEGEND: ShownLevel[] = ['free', 'maybe', 'busy', 'unknown']
const SWATCH: Record<ShownLevel, string> = { free: 'bg-success/25', maybe: 'bg-warning/30', busy: 'bg-error/25', unknown: 'availability-hatch' }

const facts = computed(() => {
  const p = data.value?.profile
  return [
    { label: t('availability.mine.changed'), value: p?.changedAt ? dates.dateTime(p.changedAt) : t('availability.mine.never') },
    { label: t('availability.mine.checked-to'), value: p?.checkedTo ? dates.day(p.checkedTo) : t('availability.mine.not-checked') },
    { label: t('availability.mine.unmarked'), value: t(`availability.levels.${p?.unmarked ?? 'unknown'}`) },
  ]
})
const asking = computed(() => (data.value?.requests ?? []).filter(r => r.open && r.state !== 'withdrawn'))
const pendingPattern = computed(() => pending.value ? m.patternOn(pending.value.date)?.label ?? '' : '')

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
        <UFormField
          :label="t('availability.mine.paint')"
          orientation="horizontal"
        >
          <UTabs
            v-model="tool"
            :items="TOOLS"
            :content="false"
            size="sm"
          />
        </UFormField>
        <UFormField
          v-if="data?.patterns.length"
          :label="t('availability.mine.target')"
          orientation="horizontal"
        >
          <USelect
            :model-value="target ?? undefined"
            :items="TARGETS"
            :placeholder="t('availability.mine.target-ask')"
            class="w-44"
            @update:model-value="target = $event as 'days' | 'pattern'"
          />
        </UFormField>
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
            :actions="r.state === 'answered' ? [] : [{ label: t('availability.mine.this-is-right'), onClick: () => m.answer(r.id) }]"
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
              :readonly="saving"
              @paint="m.paint"
            />
            <ul
              class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted"
              :aria-label="t('availability.mine.key')"
            >
              <li
                v-for="level in LEGEND"
                :key="level"
                class="flex items-center gap-1.5"
              >
                <span
                  class="inline-block size-3.5 rounded-sm border border-default"
                  :class="SWATCH[level]"
                />{{ t(`availability.levels.${level}`) }}
              </li>
            </ul>
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
    <UModal
      :open="!!pending"
      :title="t('availability.mine.which-title')"
      :description="t('availability.mine.which-help', { pattern: pendingPattern })"
      @update:open="v => { if (!v) pending = null }"
    >
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            :label="t('availability.mine.which-pattern', { pattern: pendingPattern })"
            color="neutral"
            variant="outline"
            @click="m.choose('pattern')"
          />
          <UButton
            :label="t('availability.mine.which-days')"
            @click="m.choose('days')"
          />
        </div>
      </template>
    </UModal>
  </PageFrame>
</template>

<style scoped>
.availability-hatch {
  background-image: repeating-linear-gradient(135deg, var(--ui-bg-accented) 0 4px, transparent 4px 8px);
}
</style>
