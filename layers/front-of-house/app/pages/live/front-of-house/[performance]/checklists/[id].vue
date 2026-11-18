<!-- One checklist tonight (Front of house specification, part 5, "Live mode"; FH-25): one item per
     row with a large tick, "Problem" (a reason and a note) and "Not needed"; a reading takes a number.
     Progress at the top, "Complete" once every required item has an entry. Starting it fixes its items. -->
<script setup lang="ts">
type Outcome = 'done' | 'exception' | 'not_applicable'
interface Item { id: string, label: string, help: string | null, kind: 'tick' | 'reading', unit: string | null, required: boolean, entry: { outcome: Outcome, reading: number | null, reasonCode: string | null, reasonNote: string | null, doneAt: number } | null }
interface Run { runId: string | null, checklistId: string, name: string, moment: string, state: 'not_started' | 'open' | 'complete' | 'complete_with_exceptions', completedAt: number | null, items: Item[] }
interface Board { performance: { title: string, startsAt: number }, can: { lead: boolean, checklists: boolean } }

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { time } = useDates()
const route = useRoute()
const performance = computed(() => String(route.params.performance))
const checklist = computed(() => String(route.params.id))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(performance.value)}/checklists/${encodeURIComponent(checklist.value)}`)
const { data, status, error, refresh } = await useAPI<Run>(() => base.value, { key: `front-of-house:run:${performance.value}:${checklist.value}` })
const { data: board } = await useAPI<Board>(() => `/api/front-of-house/performances/${encodeURIComponent(performance.value)}/tonight`, { key: `front-of-house:board:${performance.value}` })
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/front-of-house.exception-reason/terms', { key: 'front-of-house:exception-reasons', default: () => ({ terms: [] }) })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref<string | null>(null)
const readings = ref<Record<string, number | null>>({})
const problem = ref<{ item: Item, reasonCode: string, reasonNote: string } | null>(null)
watch(data, (d) => {
  for (const i of d?.items ?? []) if (i.kind === 'reading' && !(i.id in readings.value)) readings.value[i.id] = i.entry?.reading ?? null
}, { immediate: true })

const editable = computed(() => data.value?.state === 'open' && !!board.value?.can.checklists)
const required = computed(() => (data.value?.items ?? []).filter(i => i.required))
const entered = computed(() => required.value.filter(i => i.entry).length)
const problems = computed(() => required.value.filter(i => i.entry?.outcome === 'exception').length)
const progress = computed(() => problems.value
  ? t('front-of-house.live.done-problems', { done: entered.value - problems.value, total: required.value.length, problems: problems.value })
  : t('front-of-house.live.done-of', { done: entered.value, total: required.value.length }))
const ready = computed(() => editable.value && entered.value === required.value.length)

async function run(key: string, call: () => Promise<unknown>, done?: string) {
  refusal.value = null
  busy.value = key
  try {
    await call()
    if (done) toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = null
  }
}
const enter = (item: Item, outcome: Outcome, extra: Record<string, unknown> = {}) =>
  run(item.id, () => write(`${base.value}/items/${encodeURIComponent(item.id)}`, { method: 'PUT', body: { outcome, ...extra } }))
const start = () => run('start', () => write(`${base.value}/open`, { method: 'POST', body: {} }))
const complete = () => run('complete', () => write(`${base.value}/complete`, { method: 'POST', body: {} }), t('front-of-house.live.checklist-completed'))
const reopen = () => run('reopen', () => write(`${base.value}/reopen`, { method: 'POST', body: {} }), t('front-of-house.live.checklist-reopened'))
async function saveProblem() {
  const p = problem.value!
  await enter(p.item, 'exception', { reasonCode: p.reasonCode, reasonNote: p.reasonNote.trim() || null })
  if (!refusal.value) problem.value = null
}
const reasonLabel = (code: string | null) => reasons.value?.terms.find(r => r.id === code)?.label ?? ''
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
const context = computed(() => board.value ? [board.value.performance.title, time(board.value.performance.startsAt)].join(' · ') : undefined)
</script>

<template>
  <PageLive
    :title="data?.name ?? t('front-of-house.live.checklists')"
    :context="context"
    :back="`/live/front-of-house/${encodeURIComponent(performance)}`"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-3xl space-y-4">
          <RefusalNotice
            v-if="refusal && !problem"
            :refusal="refusal"
          />
          <UProgress
            :model-value="entered"
            :max="Math.max(required.length, 1)"
            :color="problems ? 'warning' : 'primary'"
            :aria-label="progress"
          />
          <p
            class="text-sm"
            :class="problems ? 'text-warning' : 'text-muted'"
          >
            {{ d.state !== 'open' && d.state !== 'not_started' ? t('front-of-house.live.checklist-done') : progress }}
          </p>

          <RecordList :label="d.name">
            <RecordListItem
              v-for="item in d.items"
              :key="item.id"
              :icon="item.kind === 'reading' ? 'i-lucide-gauge' : 'i-lucide-square-check'"
            >
              <template #name>
                <span class="text-lg">{{ item.label }}</span>
                <span
                  v-if="!item.required"
                  class="ms-1 text-sm font-normal text-muted"
                >{{ t('front-of-house.live.optional') }}</span>
              </template>
              <template
                v-if="item.help || item.entry?.outcome === 'exception'"
                #description
              >
                <span v-if="item.help">{{ item.help }}</span>
                <span
                  v-if="item.entry?.outcome === 'exception'"
                  class="block text-warning"
                >{{ [reasonLabel(item.entry.reasonCode), item.entry.reasonNote].filter(Boolean).join(': ') }}</span>
              </template>
              <StatusBadge
                v-if="item.entry"
                :tone="item.entry.outcome === 'done' ? 'success' : item.entry.outcome === 'exception' ? 'warning' : 'neutral'"
                :label="item.entry.outcome === 'done' && item.entry.reading !== null ? `${item.entry.reading}${item.unit ? ` ${item.unit}` : ''}` : t(`front-of-house.live.outcome.${item.entry.outcome}`)"
              />
              <template
                v-if="editable"
                #below
              >
                <div class="flex flex-wrap gap-2">
                  <template v-if="item.kind === 'reading'">
                    <UInputNumber
                      v-model="readings[item.id]"
                      size="xl"
                      class="w-40"
                      :aria-label="item.unit ? t('front-of-house.live.reading-in', { item: item.label, unit: item.unit }) : t('front-of-house.live.reading-of', { item: item.label })"
                    />
                    <UButton
                      size="xl"
                      icon="i-lucide-check"
                      :disabled="readings[item.id] === null || readings[item.id] === undefined"
                      :loading="busy === item.id"
                      :label="t('front-of-house.live.save-reading')"
                      @click="enter(item, 'done', { reading: readings[item.id] })"
                    />
                  </template>
                  <UButton
                    v-else
                    size="xl"
                    icon="i-lucide-check"
                    :variant="item.entry?.outcome === 'done' ? 'solid' : 'outline'"
                    :aria-pressed="item.entry?.outcome === 'done'"
                    :loading="busy === item.id"
                    :label="t('front-of-house.live.outcome.done')"
                    :aria-label="t('front-of-house.live.tick', { item: item.label })"
                    @click="enter(item, 'done')"
                  />
                  <UButton
                    size="xl"
                    color="warning"
                    :variant="item.entry?.outcome === 'exception' ? 'solid' : 'outline'"
                    :aria-pressed="item.entry?.outcome === 'exception'"
                    icon="i-lucide-triangle-alert"
                    :label="t('front-of-house.live.problem')"
                    :aria-label="t('front-of-house.live.problem-with', { item: item.label })"
                    @click="problem = { item, reasonCode: item.entry?.reasonCode ?? '', reasonNote: item.entry?.reasonNote ?? '' }"
                  />
                  <UButton
                    size="xl"
                    color="neutral"
                    :variant="item.entry?.outcome === 'not_applicable' ? 'solid' : 'outline'"
                    :aria-pressed="item.entry?.outcome === 'not_applicable'"
                    :label="t('front-of-house.live.outcome.not_applicable')"
                    :aria-label="t('front-of-house.live.not-needed', { item: item.label })"
                    @click="enter(item, 'not_applicable')"
                  />
                </div>
              </template>
            </RecordListItem>
          </RecordList>
        </div>
      </template>
    </DataBoundary>

    <template
      v-if="data && board?.can.checklists"
      #footer
    >
      <div class="mx-auto max-w-3xl">
        <UButton
          v-if="data.state === 'not_started'"
          size="xl"
          block
          icon="i-lucide-play"
          :loading="busy === 'start'"
          :label="t('front-of-house.live.start-checklist')"
          @click="start"
        />
        <UButton
          v-else-if="data.state === 'open'"
          size="xl"
          block
          icon="i-lucide-circle-check"
          :disabled="!ready"
          :loading="busy === 'complete'"
          :label="t('front-of-house.live.complete')"
          @click="complete"
        />
        <UButton
          v-else-if="board.can.lead"
          size="xl"
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-ccw"
          :loading="busy === 'reopen'"
          :label="t('front-of-house.live.reopen')"
          @click="reopen"
        />
      </div>
    </template>

    <UModal
      :open="!!problem"
      :title="t('front-of-house.live.problem-title', { item: problem?.item.label ?? '' })"
      @update:open="v => { if (!v) problem = null }"
    >
      <template #body>
        <UForm
          v-if="problem"
          id="fh-problem"
          :state="problem"
          :validate="() => needs({ reasonCode: problem?.reasonCode })"
          class="space-y-4"
          novalidate
          @submit="saveProblem"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="reasonCode"
            :label="t('front-of-house.live.reason')"
            required
          >
            <USelect
              v-model="problem.reasonCode"
              :items="reasonItems"
              value-key="value"
              :placeholder="t('front-of-house.live.reason-placeholder')"
              size="xl"
            />
          </UFormField>
          <UFormField
            name="reasonNote"
            :label="t('front-of-house.live.note')"
          >
            <UTextarea
              v-model="problem.reasonNote"
              :maxlength="200"
              size="xl"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-problem"
          size="xl"
          :loading="!!busy"
          :label="t('front-of-house.save')"
        />
      </template>
    </UModal>
  </PageLive>
</template>
