<!-- Answer a request (S5): the organiser's message, the request's period on My availability's grid, and
     "This is right", which answers it whether or not anything changed (R4). Painting alone never answers. -->
<script setup lang="ts">
import type { RequestView } from '../../../../composables/useRequests'

const route = useRoute()
const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal, phrase } = useRefusal()
const states = useRequestStates()

const id = computed(() => String(route.params.id))
const request = await useAPI<RequestView>(() => `/api/availability/requests/${id.value}`, { key: `availability:request:${id.value}` })
const home = computed(() => request.data.value?.request.from ?? null)
const m = await useMyAvailability({ home })
const { data, status, error, refresh, query, heading, tool, target, pending, saving, patternLabels } = m
const pendingPattern = computed(() => pending.value ? m.patternOn(pending.value.date)?.label ?? '' : null)
const r = computed(() => request.data.value?.request)
const inPeriod = computed(() => (data.value?.days ?? []).filter(x => x.date >= query.value.from && x.date <= query.value.to))

async function answer() {
  try {
    await $api(`/api/availability/requests/${id.value}/answer`, { method: 'POST', body: {} })
    toast.add({ title: t('availability.mine.answered'), color: 'success' })
    await Promise.all([request.refresh(), refresh()])
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), color: 'error' })
  }
}
</script>

<template>
  <PageFrame
    :title="r?.title ?? t('availability.asked.title')"
    :description="r ? t('availability.asked.line', { period: dates.range(r.from, r.to), due: dates.day(r.dueOn) }) : undefined"
    width="full"
    :trail="[{ label: t('availability.mine.title'), to: '/members/availability' }, { label: t('availability.asked.title'), to: '/members/availability/requests' }]"
  >
    <template
      v-if="request.data.value?.mine"
      #status
    >
      <StatusBadge
        :tone="states.tone(request.data.value.mine)"
        :label="states.label(request.data.value.mine)"
      />
    </template>
    <template
      v-if="request.data.value?.mine && request.data.value.mine !== 'withdrawn'"
      #primary
    >
      <UButton
        icon="i-lucide-check"
        :label="t('availability.mine.this-is-right')"
        loading-auto
        @click="answer"
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
          :label="t('availability.asked.period-start')"
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
        <AvailabilityPaintTools
          v-model:tool="tool"
          v-model:target="target"
          :patterns="!!data?.patterns.length"
        />
      </div>
    </template>
    <DataBoundary
      :data="request.data.value"
      :status="request.status.value"
      :error="request.error.value"
      @retry="request.refresh()"
    >
      <template #default="{ data: v }">
        <div class="space-y-6">
          <UAlert
            v-if="v.request.message"
            :title="t('availability.asked.message')"
            :description="v.request.message"
            icon="i-lucide-message-square"
            color="neutral"
            variant="subtle"
          />
          <UAlert
            v-if="!v.request.open"
            :title="t('availability.asked.closed-help')"
            icon="i-lucide-lock-open"
            color="neutral"
            variant="subtle"
          />
          <DataBoundary
            :data="data"
            :status="status"
            :error="error"
            @retry="refresh()"
          >
            <template #default="{ data: d }">
              <div class="space-y-2">
                <p class="text-sm text-muted">
                  {{ t('availability.asked.how') }}
                </p>
                <AvailabilityWeekGrid
                  :days="inPeriod"
                  :step="d.grid.step"
                  :day-starts="d.grid.dayStarts"
                  :today="d.today"
                  :horizon="d.horizon"
                  :patterns="patternLabels"
                  :readonly="saving"
                  @paint="m.paint"
                />
                <AvailabilityLegend />
              </div>
            </template>
          </DataBoundary>
        </div>
      </template>
    </DataBoundary>
    <AvailabilityPatternAsk
      :pattern="pendingPattern"
      @choose="m.choose"
      @dismiss="pending = null"
    />
  </PageFrame>
</template>
