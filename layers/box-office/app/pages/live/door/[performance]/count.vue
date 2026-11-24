<!-- The door counter (BO-73): people counted in, and out where it is offered (HC3), with large
     buttons that can be pressed without looking. It works for any performance; one never put on sale
     opens here. Inside is shown against capacity and turns the warning colour from the set share,
     reading "Full" at capacity, but a press is never refused (HC4). Tickets scanned stay beside it and
     are never added in. Presses are kept on the device and sent when online, each with an id made
     here, so a press sent twice counts once (HC2). Undo takes back this device's last press within
     the window; a supervisor corrects an older one with a reason (HC5). -->
<script setup lang="ts">
import { useIntervalFn, useOnline } from '@vueuse/core'
import { z } from 'zod'
import { fullness, newTapId } from '../../../../../shared/headcount'

interface Headcount { in: number, out: number, inside: number, peak: number, admitted: number, walkUps: number, capacity: number | null }
interface Recent { id: string, kind: 'in' | 'out', quantity: number, tappedAt: number, deviceLabel: string | null, mine: boolean, undone: boolean }
interface View { headcount: Headcount, countsOut: boolean, undoWithin: number, fullWarning: number, canCorrect: boolean, recent: Recent[] }
type Item = { kind: 'in' | 'out', id: string, quantity: number, at: number } | { kind: 'undo', id: string, reversesId: string, at: number }
interface Summary { performance: { id: string, title: string, label: string | null, startsAt: number } }
interface Term { id: string, label: string }

const GROUPS = [1, 2, 4, 10] // not-policy: the counter's buttons
const REFRESH_MS = 15_000 // not-policy: how often other doors' presses are fetched

const { t } = useT()
const { $api } = useNuxtApp()
const { time } = useDates()
const { toRefusal } = useRefusal()
const toast = useToast()
const online = useOnline()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const base = computed(() => `/api/box-office/performances/${encodeURIComponent(id.value)}`)

const { data: summary } = await useAPI<Summary>(() => `${base.value}/door/summary`, { key: `box-office:door:summary:${id.value}` })
const { data, status, error, refresh } = await useAPI<View>(() => `${base.value}/headcount`, { key: `box-office:headcount:${id.value}` })
const context = computed(() => summary.value ? [summary.value.performance.title, time(summary.value.performance.startsAt), summary.value.performance.label].filter(Boolean).join(' · ') : undefined)
useIntervalFn(() => {
  if (online.value) void refresh()
}, REFRESH_MS)

// This device's presses this visit, newest last, so Undo knows what it is taking back.
const mine = ref<{ id: string, kind: 'in' | 'out', quantity: number, at: number, undone: boolean }[]>([])
const queue = useLiveQueue<Item, { headcount: Headcount }>(
  `box-office:headcount:${id.value}`,
  items => $api<{ headcount: Headcount }>(`${base.value}/headcount/taps` as string, { method: 'POST', body: { items, offline: !online.value } }),
  {
    onSent: (_items, answer) => {
      if (data.value) data.value = { ...data.value, headcount: answer.headcount }
      void refresh()
    },
  },
)

// The server's figures with this device's presses still on their way.
const figures = computed(() => {
  const h = data.value?.headcount
  if (!h) return null
  let counted = h.in
  let left = h.out
  for (const item of queue.pending.value) {
    if (item.kind === 'undo') {
      const taken = mine.value.find(m => m.id === item.reversesId) ?? data.value?.recent.find(r => r.id === item.reversesId)
      if (taken?.kind === 'in') counted -= taken.quantity
      else if (taken) left -= taken.quantity
    }
    else if (item.kind === 'in') counted += item.quantity
    else left += item.quantity
  }
  return { ...h, in: counted, out: left, walkUps: counted, inside: Math.max(0, counted - left) }
})
const state = computed(() => figures.value ? fullness(figures.value.inside, figures.value.capacity, data.value?.fullWarning ?? 100) : 'ok') // not-policy: no warning before the setting is read
const tone = computed(() => ({ ok: 'text-highlighted', warning: 'text-warning', full: 'text-error' })[state.value])

function press(kind: 'in' | 'out', quantity: number) {
  const at = Date.now()
  const item = { kind, id: newTapId(at), quantity, at }
  mine.value = [...mine.value, { ...item, undone: false }]
  queue.add(item)
  if ('vibrate' in navigator) navigator.vibrate(40) // not-policy: a short buzz
}

// Undo is this device's newest press not yet taken back, while the window is open.
const now = ref(new Date())
useIntervalFn(() => {
  now.value = new Date()
}, 1000) // not-policy: once a second
const undoable = computed(() => {
  const last = [...mine.value].reverse().find(m => !m.undone)
  if (!last || !data.value) return null
  return now.value.getTime() - last.at <= data.value.undoWithin * 1000 ? last : null // not-policy: seconds to milliseconds
})
function undo() {
  const last = undoable.value
  if (!last) return
  last.undone = true
  queue.add({ kind: 'undo', id: newTapId(), reversesId: last.id, at: Date.now() })
  toast.add({ title: t(last.kind === 'in' ? 'box-office.headcount.undone-in' : 'box-office.headcount.undone-out', { count: last.quantity }), color: 'neutral', icon: 'i-lucide-undo-2' })
}

// A supervisor's correction of an older press, with a reason from the theatre's list.
const correcting = ref<Recent | null>(null)
const reasonSchema = z.object({ reasonId: z.string({ error: t('box-office.headcount.reason-needed') }).min(1, t('box-office.headcount.reason-needed')) })
const reasons = ref<Term[]>([])
const reasonId = ref<string | undefined>()
const saving = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function startCorrecting(r: Recent) {
  correcting.value = r
  reasonId.value = undefined
  refusal.value = null
  if (!reasons.value.length) reasons.value = (await $api<{ terms: Term[] }>('/api/core/vocabularies/box-office.headcount-correction/terms')).terms
}
async function correct() {
  if (!correcting.value || !reasonId.value) return
  saving.value = true
  refusal.value = null
  try {
    await $api(`${base.value}/headcount/correct` as string, { method: 'POST', body: { id: newTapId(), reversesId: correcting.value.id, reasonTermId: reasonId.value } })
    correcting.value = null
    toast.add({ title: t('box-office.headcount.corrected'), color: 'success', icon: 'i-lucide-circle-check' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}
const pressLabel = (r: Recent) => t(r.kind === 'in' ? 'box-office.headcount.pressed-in' : 'box-office.headcount.pressed-out', { count: r.quantity })
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col">
    <PageLive
      :title="t('box-office.live-door.title')"
      :context="context"
      back="/live/door"
    >
      <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <BoxOfficeDoorModes
          :performance-id="id"
          mode="count"
        />
        <DataBoundary
          :data="data"
          :status="status"
          :error="error"
          @retry="refresh()"
        >
          <template #default="{ data: d }">
            <div class="flex flex-1 flex-col gap-4">
              <section
                class="text-center"
                aria-live="polite"
              >
                <h2 class="text-lg font-medium text-muted">
                  {{ d.countsOut ? t('box-office.headcount.inside') : t('box-office.headcount.walk-ups') }}
                </h2>
                <p
                  class="text-7xl font-bold tabular-nums"
                  :class="tone"
                >
                  {{ d.countsOut ? figures?.inside : figures?.walkUps }}
                </p>
                <p
                  v-if="figures?.capacity"
                  class="text-lg"
                  :class="state === 'ok' ? 'text-muted' : tone"
                >
                  {{ state === 'full' ? t('box-office.headcount.full', { inside: d.countsOut ? figures.inside : figures.walkUps, capacity: figures.capacity }) : t('box-office.headcount.of-capacity', { capacity: figures.capacity }) }}
                </p>
                <p class="mt-1 text-sm text-muted">
                  {{ t('box-office.headcount.scanned', { count: figures?.admitted ?? 0 }) }}<template v-if="d.countsOut">
                    · {{ t('box-office.headcount.peak', { count: Math.max(figures?.peak ?? 0, figures?.inside ?? 0) }) }}
                  </template>
                </p>
              </section>

              <div class="mt-auto grid grid-cols-2 gap-3">
                <UButton
                  v-for="n in GROUPS"
                  :key="n"
                  size="xl"
                  icon="i-lucide-plus"
                  class="min-h-24 justify-center text-2xl"
                  :label="t('box-office.headcount.in', { count: n })"
                  :aria-label="t('box-office.headcount.in-aria', { count: n })"
                  @click="press('in', n)"
                />
                <UButton
                  v-if="d.countsOut"
                  size="xl"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-minus"
                  class="col-span-2 min-h-24 justify-center text-2xl"
                  :label="t('box-office.headcount.out')"
                  @click="press('out', 1)"
                />
              </div>

              <section
                v-if="d.recent.length"
                class="space-y-2"
              >
                <h2 class="font-medium text-highlighted">
                  {{ t('box-office.headcount.recent') }}
                </h2>
                <RecordList>
                  <RecordListItem
                    v-for="r in d.recent"
                    :key="r.id"
                    :title="pressLabel(r)"
                    :description="[time(r.tappedAt), r.deviceLabel, r.undone ? t('box-office.headcount.was-undone') : null].filter(Boolean).join(' · ')"
                  >
                    <UButton
                      v-if="d.canCorrect && !r.undone"
                      :label="t('box-office.headcount.correct')"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="startCorrecting(r)"
                    />
                  </RecordListItem>
                </RecordList>
              </section>
            </div>
          </template>
        </DataBoundary>
      </div>

      <template #footer>
        <div class="mx-auto max-w-2xl">
          <UButton
            block
            size="xl"
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            :disabled="!undoable"
            :label="undoable ? t(undoable.kind === 'in' ? 'box-office.headcount.undo-in' : 'box-office.headcount.undo-out', { count: undoable.quantity }) : t('box-office.headcount.undo')"
            @click="undo"
          />
        </div>
      </template>
    </PageLive>

    <UModal
      :open="!!correcting"
      :title="t('box-office.headcount.correct-title')"
      :description="correcting ? t('box-office.headcount.correct-description', { press: pressLabel(correcting), time: time(correcting.tappedAt) }) : undefined"
      @update:open="open => { if (!open) correcting = null }"
    >
      <template #body>
        <UForm
          :state="{ reasonId }"
          :schema="reasonSchema"
          class="space-y-4"
          novalidate
          @submit="correct"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="reasonId"
            :label="t('box-office.headcount.reason')"
            required
          >
            <USelect
              v-model="reasonId"
              :items="reasons.map(r => ({ label: r.label, value: r.id }))"
            />
          </UFormField>
          <UButton
            type="submit"
            :label="t('box-office.headcount.correct-button')"
            :loading="saving"
          />
        </UForm>
      </template>
    </UModal>
  </div>
</template>
