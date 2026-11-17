<!-- The tonight board (Front of house specification, part 5, "Live mode"; FH-19 to FH-23): the
     performance, time to curtain and the next timing as one large button; then People, Checklists,
     Figures and Incidents; at the foot, reporting an incident and the emergency card. Someone leading
     also sees "Extend tonight" and the night report. It reads again every half minute. -->
<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

interface Person { assignmentId: string, name: string, state: string, checkedInAt: number | null, notArrived: boolean }
interface Board {
  performance: { id: string, title: string, startsAt: number, endsAt: number, venueId: string, venueName: string, spaceName: string }
  windowClosesAt: number | null
  shifts: { id: string, dutyName: string, isLead: boolean, callAt: number, places: number, people: Person[] }[]
  timings: { kind: string, at: number }[]
  checklists: { checklistId: string, name: string, moment: string, runId: string | null, state: string, entered: number, required: number, exceptions: number }[]
  figures: { id: string, label: string, value: string | number | null, state: 'ok' | 'attention' | 'unavailable', to?: string, unit?: string }[]
  mine: string | null
  openIncidents: number | null
  can: { lead: boolean, checklists: boolean, report: boolean, incident: boolean, emergency: boolean }
}

const KINDS = ['house_open', 'curtain_up', 'interval_start', 'interval_end', 'curtain_down', 'house_clear'] as const
const REFRESH = 30_000 // not-policy: how often the board reads again

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { time } = useDates()
const figure = useFigureValue()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}`)
const { data, status, error, refresh } = await useAPI<Board>(() => `${base.value}/tonight`, { key: `front-of-house:board:${id.value}` })
useIntervalFn(() => { void refresh() }, REFRESH)

const now = ref(Date.now())
useIntervalFn(() => { now.value = Date.now() }, 15_000) // not-policy: how often the countdown moves
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)

const recorded = (kind: string) => data.value?.timings.find(x => x.kind === kind)
// The next moment not yet recorded. A show with no interval goes from curtain up to curtain down.
const next = computed(() => KINDS.find(k => !recorded(k)) ?? null)
const alsoNext = computed(() => next.value === 'interval_start' ? 'curtain_down' : null)
const toCurtain = computed(() => {
  const d = data.value
  if (!d || recorded('curtain_up')) return null
  const minutes = Math.round((d.performance.startsAt - now.value) / 60_000) // not-policy: milliseconds to minutes
  return minutes > 0 ? t('front-of-house.live.to-curtain', { count: minutes }) : t('front-of-house.live.curtain-due')
})
const people = computed(() => {
  const all = (data.value?.shifts ?? []).flatMap(s => s.people)
  return { arrived: all.filter(p => p.state === 'checked_in').length, expected: all.length, missing: all.filter(p => p.notArrived).length }
})

async function act(run: () => Promise<unknown>, done: string) {
  refusal.value = null
  busy.value = true
  try {
    await run()
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
const record = (kind: string) => act(() => write(`${base.value}/timings`, { method: 'POST', body: { kind } }), t('front-of-house.live.recorded', { timing: t(`front-of-house.timings.${kind}`) }))
const checkIn = () => act(() => write(`/api/front-of-house/assignments/${encodeURIComponent(data.value!.mine!)}/check-in`, { method: 'POST', body: {} }), t('front-of-house.live.checked-in'))
async function extend() {
  if (!(await confirm({ verb: t('front-of-house.live.extend'), thing: t('front-of-house.live.tonight'), consequence: t('front-of-house.live.extend-consequence'), button: t('front-of-house.live.extend') }))) return
  await act(() => write(`${base.value}/extend`, { method: 'POST', body: {} }), t('front-of-house.live.extended'))
}
const mineIn = computed(() => {
  const d = data.value
  return d?.mine ? d.shifts.flatMap(s => s.people).find(p => p.assignmentId === d.mine)?.state === 'checked_in' : false
})
const context = computed(() => data.value ? [data.value.performance.title, time(data.value.performance.startsAt), data.value.performance.venueName].filter(Boolean).join(' · ') : undefined)
</script>

<template>
  <PageLive
    :title="t('front-of-house.live.board')"
    :context="context"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-4xl space-y-6">
          <RefusalNotice
            v-if="refusal"
            :refusal="refusal"
          />

          <div class="space-y-3">
            <p
              v-if="toCurtain"
              class="text-2xl font-semibold text-highlighted"
            >
              {{ toCurtain }}
            </p>
            <UButton
              v-if="d.mine && !mineIn"
              icon="i-lucide-hand"
              size="xl"
              block
              :loading="busy"
              :label="t('front-of-house.live.im-here')"
              class="min-h-16 text-lg"
              @click="checkIn"
            />
            <template v-if="d.can.lead && next">
              <UButton
                icon="i-lucide-clock"
                size="xl"
                block
                :loading="busy"
                :label="t(`front-of-house.live.record.${next}`)"
                class="min-h-16 text-lg"
                @click="record(next)"
              />
              <UButton
                v-if="alsoNext"
                color="neutral"
                variant="outline"
                size="xl"
                block
                :label="t('front-of-house.live.no-interval')"
                @click="record(alsoNext)"
              />
            </template>
            <p
              v-if="d.timings.length"
              class="text-sm text-muted"
            >
              {{ d.timings.map(x => `${t(`front-of-house.timings.${x.kind}`)} ${time(x.at)}`).join(' · ') }}
            </p>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UButton
              :to="`/live/front-of-house/${encodeURIComponent(d.performance.id)}/people`"
              icon="i-lucide-users"
              color="neutral"
              variant="outline"
              size="xl"
              block
              class="min-h-24 justify-start"
            >
              <span class="flex flex-col text-start">
                <span class="text-lg font-semibold">{{ t('front-of-house.live.people') }}</span>
                <span>{{ t('front-of-house.live.arrived-of', { arrived: people.arrived, expected: people.expected }) }}</span>
                <span
                  v-if="people.missing"
                  class="text-warning"
                >{{ t('front-of-house.live.not-arrived', { count: people.missing }) }}</span>
              </span>
            </UButton>
            <UButton
              v-if="d.openIncidents !== null"
              to="/console/front-of-house/incidents"
              icon="i-lucide-shield-alert"
              color="neutral"
              variant="outline"
              size="xl"
              block
              class="min-h-24 justify-start"
            >
              <span class="flex flex-col text-start">
                <span class="text-lg font-semibold">{{ t('front-of-house.live.incidents') }}</span>
                <span>{{ t('front-of-house.live.open-incidents', { count: d.openIncidents }) }}</span>
              </span>
            </UButton>
          </div>

          <section
            v-if="d.checklists.length"
            aria-labelledby="fh-board-checklists"
          >
            <h2
              id="fh-board-checklists"
              class="mb-3 text-sm font-semibold text-muted"
            >
              {{ t('front-of-house.live.checklists') }}
            </h2>
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <li
                v-for="c in d.checklists"
                :key="c.checklistId"
              >
                <UButton
                  :to="`/live/front-of-house/${encodeURIComponent(d.performance.id)}/checklists/${encodeURIComponent(c.checklistId)}`"
                  :icon="c.state === 'completed' ? 'i-lucide-circle-check' : 'i-lucide-list-checks'"
                  color="neutral"
                  variant="outline"
                  size="xl"
                  block
                  class="min-h-20 justify-start"
                >
                  <span class="flex flex-col text-start">
                    <span class="font-semibold">{{ c.name }}</span>
                    <span>{{ c.state === 'completed' ? t('front-of-house.live.checklist-done') : t('front-of-house.live.done-of', { done: c.entered, total: c.required }) }}</span>
                    <span
                      v-if="c.exceptions"
                      class="text-warning"
                    >{{ t('front-of-house.live.exceptions', { count: c.exceptions }) }}</span>
                  </span>
                </UButton>
              </li>
            </ul>
          </section>

          <section
            v-if="d.figures.length"
            aria-labelledby="fh-board-figures"
          >
            <h2
              id="fh-board-figures"
              class="mb-3 text-sm font-semibold text-muted"
            >
              {{ t('front-of-house.live.figures') }}
            </h2>
            <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div
                v-for="f in d.figures"
                :key="f.id"
                class="rounded-lg border border-default p-4"
                :class="f.state === 'attention' ? 'border-warning' : ''"
              >
                <dt class="text-sm text-muted">
                  {{ figure.label(f.label) }}
                </dt>
                <dd class="text-2xl font-semibold text-highlighted">
                  {{ figure.value(f.value, f.unit) }}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </template>
    </DataBoundary>

    <template
      v-if="data"
      #footer
    >
      <div class="mx-auto flex max-w-4xl flex-wrap gap-3">
        <UButton
          v-if="data.can.incident"
          :to="`/live/front-of-house/incident?performance=${encodeURIComponent(data.performance.id)}`"
          icon="i-lucide-shield-alert"
          color="warning"
          size="xl"
          class="flex-1 justify-center"
          :label="t('front-of-house.live.report-incident')"
        />
        <UButton
          v-if="data.can.emergency"
          :to="`/live/front-of-house/emergency/${encodeURIComponent(data.performance.venueId)}`"
          icon="i-lucide-siren"
          color="error"
          variant="outline"
          size="xl"
          class="flex-1 justify-center"
          :label="t('front-of-house.live.emergency-card')"
        />
        <UButton
          v-if="data.can.lead"
          icon="i-lucide-clock-plus"
          color="neutral"
          variant="outline"
          size="xl"
          class="flex-1 justify-center"
          :label="t('front-of-house.live.extend')"
          @click="extend"
        />
        <UButton
          v-if="data.can.report"
          :to="`/live/front-of-house/${encodeURIComponent(data.performance.id)}/report`"
          icon="i-lucide-notebook-pen"
          color="neutral"
          variant="outline"
          size="xl"
          class="flex-1 justify-center"
          :label="t('front-of-house.live.night-report')"
        />
      </div>
    </template>
  </PageLive>
</template>
