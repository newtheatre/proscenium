<!-- The tonight board (Front of house specification, part 5, "Live mode"; FH-19 to FH-23): the
     performance, time to curtain and the next timing as one large button; then People, Checklists,
     Figures and Incidents; at the foot, reporting an incident and the emergency card. Someone leading
     also sees who is coming needing help, can correct a timing, and after curtain down "Extend
     tonight" and the night report. It reads again every half minute. -->
<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

interface Person { assignmentId: string, name: string, state: string, checkedInAt: number | null, notArrived: boolean }
interface Need { name: string, seat: string | null, needs: { key: string, label: string }[], companions: number }
interface Board {
  performance: { id: string, title: string, startsAt: number, endsAt: number, venueId: string, venueName: string, spaceName: string }
  windowClosesAt: number | null
  shifts: { id: string, dutyName: string, isLead: boolean, callAt: number, places: number, people: Person[] }[]
  timings: { kind: string, at: number }[]
  checklists: { checklistId: string, name: string, moment: string, runId: string | null, state: string, entered: number, required: number, exceptions: number }[]
  figures: { id: string, label: string, value: string | number | null, state: 'ok' | 'attention' | 'unavailable', to?: string, unit?: string }[]
  mine: string | null
  openIncidents: number | null
  needs: Need[] | null
  can: { lead: boolean, checklists: boolean, report: boolean, incident: boolean, emergency: boolean }
}

const KINDS = ['house_open', 'curtain_up', 'interval_start', 'interval_end', 'curtain_down', 'house_clear'] as const
const REFRESH = 30_000 // not-policy: how often the board reads again

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const undo = useUndo()
const { time } = useDates()
const figure = useFigureValue()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}`)
const { data, status, error, refresh } = await useAPI<Board>(() => `${base.value}/tonight`, { key: `front-of-house:board:${id.value}` })
useIntervalFn(() => { void refresh() }, REFRESH)
// The emergency card is kept on the device from here, before anyone needs it in a hurry.
const { fetchAhead } = useKeptCards()
onMounted(() => { if (data.value?.can.emergency) void fetchAhead() })

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

async function act(run: () => Promise<unknown>, done: string, reverse?: () => Promise<unknown>) {
  refusal.value = null
  busy.value = true
  try {
    await run()
    if (reverse) {
      undo.offer(done, async () => {
        await reverse()
        await refresh()
      })
    }
    else toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
const MINUTE = 60_000 // not-policy: unit conversion
// When a moment is usually recorded, to ask before one far from it (NI-2). House open is half an hour
// before curtain up, and the house is clear a quarter of an hour after curtain down.
const FAR = 20 * MINUTE // not-policy: how far from the usual time a tap is questioned
function usual(kind: string): number | null {
  const p = data.value?.performance
  if (!p) return null
  if (kind === 'house_open') return p.startsAt - 30 * MINUTE // not-policy: the usual call
  if (kind === 'curtain_up') return p.startsAt
  if (kind === 'curtain_down') return p.endsAt
  if (kind === 'house_clear') return p.endsAt + 15 * MINUTE // not-policy: the usual clear
  return null
}
const preShowOpen = computed(() => (data.value?.checklists ?? []).filter(c => c.moment === 'pre-show' && !c.state.startsWith('complete')))
async function record(kind: string) {
  const at = Date.now()
  // Opening with a checklist for before the show not finished: warn, as the setting promises (NI-1).
  if (kind === 'house_open' && preShowOpen.value.length) {
    const done = preShowOpen.value.reduce((n, c) => n + c.entered, 0)
    const total = preShowOpen.value.reduce((n, c) => n + c.required, 0)
    if (!(await confirm({ verb: t('front-of-house.live.open-verb'), thing: t('front-of-house.live.the-house'), consequence: t('front-of-house.live.open-checklists', { done, total, names: preShowOpen.value.map(c => c.name).join(', ') }), button: t('front-of-house.live.open-anyway') }))) return
  }
  const expected = usual(kind)
  const previous = data.value?.timings.reduce<number | null>((m, x) => (m === null || x.at > m ? x.at : m), null) ?? null
  const far = expected !== null && Math.abs(at - expected) > FAR
  const soon = previous !== null && at - previous < MINUTE
  if ((far || soon) && !(await confirm({
    verb: t('front-of-house.live.record-verb'),
    thing: t(`front-of-house.live.timing-thing.${kind}`),
    consequence: soon ? t('front-of-house.live.record-soon') : t('front-of-house.live.record-far', { usual: time(expected!), now: time(at) }),
    button: t(`front-of-house.live.record.${kind}`),
  }))) return
  await act(
    () => write(`${base.value}/timings`, { method: 'POST', body: { kind } }),
    t('front-of-house.live.recorded', { timing: t(`front-of-house.timings.${kind}`) }),
    () => write(`${base.value}/timings/${kind}`, { method: 'DELETE', body: {} }),
  )
}
// The lead corrects a timing already recorded, or takes it back (NI-2).
const editing = ref<{ kind: string, at: number | null } | null>(null)
const recordedItems = computed(() => (data.value?.timings ?? []).map(x => ({ value: x.kind, label: t(`front-of-house.timings.${x.kind}`) })))
function editTimings() {
  const first = data.value?.timings[data.value.timings.length - 1]
  editing.value = first ? { kind: first.kind, at: first.at } : null
}
watch(() => editing.value?.kind, (kind) => {
  if (editing.value && kind) editing.value.at = recorded(kind)?.at ?? null
})
async function saveTiming() {
  const e = editing.value!
  await act(() => write(`${base.value}/timings`, { method: 'POST', body: { kind: e.kind, at: e.at } }), t('front-of-house.live.recorded', { timing: t(`front-of-house.timings.${e.kind}`) }))
  if (!refusal.value) editing.value = null
}
async function removeTiming() {
  const e = editing.value!
  await act(() => write(`${base.value}/timings/${e.kind}`, { method: 'DELETE', body: {} }), t('front-of-house.live.timing-removed', { timing: t(`front-of-house.timings.${e.kind}`) }))
  if (!refusal.value) editing.value = null
}
const checkIn = () => act(() => write(`/api/front-of-house/assignments/${encodeURIComponent(data.value!.mine!)}/check-in`, { method: 'POST', body: {} }), t('front-of-house.live.checked-in'))
async function extend() {
  if (!(await confirm({ verb: t('front-of-house.live.extend-verb'), thing: t('front-of-house.live.tonight'), consequence: t('front-of-house.live.extend-consequence'), button: t('front-of-house.live.extend') }))) return
  await act(() => write(`${base.value}/extend`, { method: 'POST', body: {} }), t('front-of-house.live.extended'))
}
const mineIn = computed(() => {
  const d = data.value
  return d?.mine ? d.shifts.flatMap(s => s.people).find(p => p.assignmentId === d.mine)?.state === 'checked_in' : false
})
// The space only when it says more than the venue (NI-6).
const context = computed(() => {
  const p = data.value?.performance
  if (!p) return undefined
  return [p.title, time(p.startsAt), p.venueName, p.spaceName !== p.venueName ? p.spaceName : null].filter(Boolean).join(' · ')
})
const checklistLine = (c: Board['checklists'][number]) => c.state.startsWith('complete')
  ? t('front-of-house.live.checklist-done')
  : c.exceptions
    ? t('front-of-house.live.done-problems', { done: c.entered - c.exceptions, total: c.required, problems: c.exceptions })
    : t('front-of-house.live.done-of', { done: c.entered, total: c.required })
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
            <div
              v-if="d.timings.length"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <p class="text-sm text-muted">
                {{ d.timings.map(x => `${t(`front-of-house.timings.${x.kind}`)} ${time(x.at)}`).join(' · ') }}
              </p>
              <UButton
                v-if="d.can.lead"
                color="neutral"
                variant="link"
                icon="i-lucide-pencil"
                :label="t('front-of-house.live.edit-timings')"
                @click="editTimings"
              />
            </div>
            <UButton
              v-if="d.can.lead && recorded('curtain_down')"
              icon="i-lucide-clock-plus"
              color="neutral"
              variant="outline"
              size="xl"
              block
              :label="t('front-of-house.live.extend')"
              @click="extend"
            />
          </div>

          <section
            v-if="d.needs"
            aria-labelledby="fh-board-needs"
          >
            <h2
              id="fh-board-needs"
              class="mb-3 text-sm font-semibold text-muted"
            >
              {{ t('front-of-house.live.needs-tonight') }}
            </h2>
            <p
              v-if="!d.needs.length"
              class="text-muted"
            >
              {{ t('front-of-house.live.no-needs') }}
            </p>
            <RecordList
              v-else
              :label="t('front-of-house.live.needs-tonight')"
            >
              <RecordListItem
                v-for="(n, i) in d.needs"
                :key="i"
                icon="i-lucide-accessibility"
                :name="n.name"
                :description="[n.seat, n.companions ? t('front-of-house.live.companions', { count: n.companions }) : null].filter(Boolean).join(' · ')"
              >
                <template #below>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="need in n.needs"
                      :key="need.key"
                      color="neutral"
                      variant="subtle"
                      size="lg"
                      :label="need.label"
                    />
                  </div>
                </template>
              </RecordListItem>
            </RecordList>
          </section>

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
            <UButton
              v-if="d.can.report"
              :to="`/live/front-of-house/${encodeURIComponent(d.performance.id)}/report`"
              icon="i-lucide-notebook-pen"
              color="neutral"
              variant="outline"
              size="xl"
              block
              class="min-h-24 justify-start"
            >
              <span class="flex flex-col text-start">
                <span class="text-lg font-semibold">{{ t('front-of-house.live.night-report') }}</span>
                <span>{{ t('front-of-house.live.night-report-hint') }}</span>
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
                  :icon="c.state.startsWith('complete') ? 'i-lucide-circle-check' : 'i-lucide-list-checks'"
                  color="neutral"
                  variant="outline"
                  size="xl"
                  block
                  class="min-h-20 justify-start"
                >
                  <span class="flex flex-col text-start">
                    <span class="font-semibold">{{ c.name }}</span>
                    <span :class="c.exceptions ? 'text-warning' : ''">{{ checklistLine(c) }}</span>
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
      <div class="mx-auto flex max-w-4xl gap-3">
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
          :to="`/live/front-of-house/emergency/${encodeURIComponent(data.performance.venueId)}?performance=${encodeURIComponent(data.performance.id)}`"
          icon="i-lucide-siren"
          color="error"
          variant="outline"
          size="xl"
          class="flex-1 justify-center"
          :label="t('front-of-house.live.emergency-card')"
        />
      </div>
    </template>

    <UModal
      :open="!!editing"
      :title="t('front-of-house.live.edit-timings')"
      :description="t('front-of-house.live.edit-timings-help')"
      @update:open="v => { if (!v) editing = null }"
    >
      <template #body>
        <UForm
          v-if="editing"
          id="fh-timing"
          :state="editing"
          :validate="() => needs({ at: editing?.at })"
          class="space-y-4"
          novalidate
          @submit="saveTiming"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="kind"
            :label="t('front-of-house.live.timing')"
          >
            <USelect
              v-model="editing.kind"
              :items="recordedItems"
              size="xl"
            />
          </UFormField>
          <UFormField
            name="at"
            :label="t('front-of-house.live.timing-at')"
          >
            <FieldDateTime v-model="editing.at" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          color="error"
          variant="outline"
          size="xl"
          icon="i-lucide-trash-2"
          :loading="busy"
          :label="t('front-of-house.live.remove-timing')"
          @click="removeTiming"
        />
        <UButton
          type="submit"
          form="fh-timing"
          size="xl"
          :loading="busy"
          :label="t('front-of-house.save')"
        />
      </template>
    </UModal>
  </PageLive>
</template>
