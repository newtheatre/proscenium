<!-- The door in live mode (BO-40; Matt's option B, 2026-11-17): the camera is the screen. It reads
     tickets and membership cards one after another, and each result shows at once as one large banner
     that can be read at arm's length: green admitted, amber already in or a card to look at, blue not
     paid (a reservation's own QR code: the door takes no money, so they go to the box office or the
     till), red anything that does not get in, including a ticket whose holder no longer qualifies for
     its type (such as a lapsed member), who goes to the box office to change it, unless a holder of the
     override admits them anyway with a reason (R-30). How many are in stays in view. Typing a code, finding
     someone by name and pausing the camera are the large buttons at the foot. Under the count, when
     latecomers are let in. Every result arrives fresh: the banner springs in, the phone buzzes where it
     can (one short buzz for in, two for a look, one long for no), and an admission clears itself after
     a few seconds, so the next ticket is never mistaken for the last. A paid booking's own code, such
     as the QR code from its reservation, admits a single ticket at once; for several, the screen offers
     Admit one (as each person reaches the door) and Admit all, until everyone on it is in.
     Offline (D2), the door keeps working from its copy of the door list on the device
     (useOfflineDoor): a ticket's signed code is checked here, admitted here and sent when the
     connection returns; the strip says how many admissions are waiting. The door list can be
     printed as the paper fallback. -->
<script setup lang="ts">
import { useDebounceFn, useOnline } from '@vueuse/core'

interface Summary { performance: { id: string, title: string, label: string | null, startsAt: number, venue: string, latecomers: string }, tickets: number, admitted: number, unpaid: number }
interface Scan {
  result: string
  admittedAt?: number
  card?: { headline: string, line: string, state: 'ok' | 'attention' }
  booking?: { reference: string, buyer: string | null, ticketType: string, admitted: number, tickets: number }
  reservation?: { reference: string, buyer: string | null, tickets: number, amountDueMinor: number, currency: string }
  requirement?: { reason: string | null, ticketType: string }
  unchecked?: boolean
  ticketId?: string
  overridable?: boolean
  ticketPerformance?: DoorElsewhere
  reference?: string
}
interface Row { id: string, reference: string, buyer: string | null, channel?: string, at?: number, tickets: number, admitted: number, unpaid?: { amountDueMinor: number, currency: string } }
type Tone = 'success' | 'warning' | 'info' | 'error'
// `who` names the booking a result was about, for Last scans; `collect` is a reservation to send to the till.
interface Shown { tone: Tone, icon: string, headline: string, line: string, at: number, who?: string, collect?: string, override?: { ticketId: string, ticketType: string, reason: string | null } }
interface Term { id: string, label: string }

// Another performance's ticket is ours, so it is amber, with the show and time to tell them (D1).
const TONES: Record<string, Tone> = { admitted: 'success', card: 'success', already_admitted: 'warning', wrong_performance: 'warning', not_paid: 'info', pass: 'info', not_on_list: 'warning', card_offline: 'warning' }
const ICONS: Record<Tone, string> = { success: 'i-lucide-circle-check', warning: 'i-lucide-circle-alert', info: 'i-lucide-hand-coins', error: 'i-lucide-circle-x' }
// The banner's colours: strong enough to read across a foyer, with text that passes contrast on each.
const BANNER: Record<Tone, string> = { success: 'bg-success text-inverted', warning: 'bg-warning text-inverted', info: 'bg-info text-inverted', error: 'bg-error text-inverted' }
const TEXT: Record<Tone, string> = { success: 'text-success', warning: 'text-warning', info: 'text-info', error: 'text-error' }
const FRAME: Record<Tone, string> = { success: 'border-success', warning: 'border-warning', info: 'border-info', error: 'border-error' }
const RECENT = 6 // not-policy: how many past scans the screen lists
const CLEAR_MS = 4000 // not-policy: how long an admission stays up before the screen is ready again
// Ignored where the browser cannot vibrate, such as Safari on an iPhone.
const BUZZ: Record<Tone, number[]> = { success: [90], warning: [90, 70, 90], info: [90, 70, 90], error: [400] } // not-policy: vibration patterns
// What a ticket code, a booking reference or a desk code looks like; anything else typed is a name (D4).
const CODE = /^(?:[^.\s]+\.){3}[^.\s]+$|^[A-HJKMNP-Z2-9]{8}$|^[A-HJKMNP-Z2-9]{10}$/i // not-policy: the shapes codes.ts and tickets.ts make

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { time } = useDates()
const { money } = await useMoney()
const elsewhere = useDoorElsewhere()
const nameOf = useDoorName()
const online = useOnline()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const base = computed(() => `/api/box-office/performances/${encodeURIComponent(id.value)}`)
// Whoever may open the till is sent there with a reservation; anyone else sends the buyer.
const { data: live } = await useNavigation('live')
const tillTo = (reference: string) => live.value?.items.some(i => i.to === '/live/till') ? `/live/till?panel=box-office&collect=${encodeURIComponent(reference)}` : undefined

const { data, status, error, refresh } = await useAPI<Summary>(() => `${base.value}/door/summary`, { key: `box-office:door:summary:${id.value}` })

// The door's copy on the device, and the admissions made offline waiting to be sent.
const toast = useToast()
const door = useOfflineDoor(id, {
  onSent: (results) => {
    const admitted = results.filter(r => r.result === 'admitted').reduce((n, r) => n + (r.admitted ?? 1), 0)
    const turned = results.filter(r => r.result !== 'admitted' && r.result !== 'sent').length
    toast.add({
      title: t('box-office.live-door.offline-sent', { count: admitted }),
      ...turned ? { description: t('box-office.live-door.offline-sent-problems', { count: turned }), color: 'warning' as const } : { color: 'success' as const },
    })
    void refresh()
  },
})
// Offline, the counts are the device's: the server's last word with what was admitted here since.
const counts = computed(() => (!online.value && door.summary.value) ? door.summary.value : data.value)
const context = computed(() => data.value ? [data.value.performance.title, time(data.value.performance.startsAt), data.value.performance.label].filter(Boolean).join(' · ') : undefined)

// The camera runs from the moment the screen opens, until paused.
const video = ref<HTMLVideoElement | null>(null)
const running = ref(true)
const { problem, starting } = useCodeCamera(video, running, (code) => {
  void scan(code)
  return undefined
})

const shown = ref<Shown | null>(null)
const recent = ref<Shown[]>([])

function describe(out: Scan): Shown {
  const tone: Tone = out.result === 'card' && out.card?.state === 'attention' ? 'warning' : TONES[out.result] ?? 'error'
  let headline = t(`box-office.live-door.result.${out.result}`)
  let line = t(`box-office.door.scan.result.${out.result}`, { when: out.admittedAt ? time(out.admittedAt) : '' })
  if (out.result === 'card' && out.card) {
    headline = out.card.headline
    line = out.card.line
  }
  else if (out.result === 'admitted' && out.booking) {
    line = t('box-office.live-door.line.admitted', { type: out.booking.ticketType, admitted: out.booking.admitted, tickets: out.booking.tickets, reference: out.booking.reference })
    if (out.unchecked) line = `${line}. ${t('box-office.door.scan.unchecked')}`
  }
  else if (out.result === 'requirement_not_met' && out.requirement?.reason) {
    line = t('box-office.live-door.line.requirement_not_met', { type: out.requirement.ticketType, reason: out.requirement.reason })
  }
  else if (out.result === 'wrong_performance') {
    line = elsewhere(out.ticketPerformance, data.value?.performance.startsAt)
  }
  else if (out.result === 'already_admitted' && out.booking && out.admittedAt) {
    line = t('box-office.live-door.line.already_admitted', { when: time(out.admittedAt), reference: out.booking.reference })
  }
  else if (out.result === 'already_admitted' && out.booking) {
    // Checked on the device, which knows the ticket is in but not when.
    line = t('box-office.live-door.line.already_admitted-here', { reference: out.booking.reference })
  }
  else if (out.result === 'not_paid' && out.reservation) {
    const owed = { count: out.reservation.tickets, amount: money(out.reservation.amountDueMinor, out.reservation.currency), reference: out.reservation.reference }
    line = out.reservation.buyer
      ? t('box-office.live-door.line.not_paid-named', { ...owed, buyer: out.reservation.buyer })
      : t('box-office.live-door.line.not_paid', owed)
  }
  // R-30: a holder of the override may admit anyway, never on their own booking; the server says when.
  const override = out.result === 'requirement_not_met' && out.overridable && out.ticketId && out.requirement
    ? { ticketId: out.ticketId, ticketType: out.requirement.ticketType, reason: out.requirement.reason }
    : undefined
  const about = out.booking ?? out.reservation
  const who = about ? [about.buyer, about.reference].filter(Boolean).join(' · ') : undefined
  const collect = out.result === 'not_paid' ? out.reservation?.reference : undefined
  return { tone, icon: ICONS[tone], headline, line, at: Date.now(), ...who ? { who } : {}, ...collect ? { collect } : {}, ...override ? { override } : {} }
}

let clearing: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(clearing))
function show(result: Shown) {
  shown.value = result
  recent.value = [result, ...recent.value].slice(0, RECENT)
  try {
    navigator.vibrate?.(BUZZ[result.tone])
  }
  catch {
    // A browser that refuses to vibrate still shows the result.
  }
  clearTimeout(clearing)
  if (result.tone === 'success' && !result.override) clearing = setTimeout(() => {
    if (shown.value?.at === result.at) shown.value = group.value ? groupShown(group.value) : null
  }, CLEAR_MS)
}

// A booking of several waiting to come in, after its own code was scanned: admitted one by one or all at once.
const group = ref<Row | null>(null)
const groupShown = (row: Row): Shown => ({ tone: 'info', icon: 'i-lucide-users', headline: t('box-office.live-door.result.reference'), line: `${nameOf(row)} · ${row.reference}. ${t('box-office.live-door.line.booking-waiting', { waiting: row.tickets - row.admitted, tickets: row.tickets })}`, at: Date.now(), who: `${nameOf(row)} · ${row.reference}` })
async function admitFromGroup(count: number) {
  const row = group.value
  if (!row) return
  const admitted = await admit(row, count)
  if (group.value !== row) return
  const left = { ...row, admitted: row.admitted + admitted }
  group.value = left.admitted < left.tickets && admitted ? left : null
}

// A paid booking's own code for tonight, such as its reservation's QR code: everyone on it not yet in goes in.
async function admitBooking(reference: string) {
  const rows = online.value
    ? await $api<{ rows: Row[] }>(`${base.value}/door`, { query: { q: reference } }).then(r => r.rows).catch(() => [] as Row[])
    : door.find(reference)
  const row = rows.find(r => r.reference.toUpperCase() === reference.toUpperCase() && !r.unpaid)
  if (!row) {
    query.value = reference
    finding.value = true
    return
  }
  group.value = null
  if (row.admitted >= row.tickets) {
    show({ tone: 'warning', icon: ICONS.warning, headline: t('box-office.live-door.result.already_admitted'), line: t('box-office.live-door.line.booking-in', { reference: row.reference }), at: Date.now(), who: `${nameOf(row)} · ${row.reference}` })
    return
  }
  if (row.tickets - row.admitted === 1) {
    await admit(row, 1)
    return
  }
  group.value = row
  show(groupShown(row))
}

/** Offline: checked against the device's copy of the door list, and admitted here. */
async function scanOffline(code: string) {
  if (!door.ready.value) {
    show({ tone: 'error', icon: ICONS.error, headline: t('box-office.live-door.result.problem'), line: t('box-office.live-door.offline'), at: Date.now() })
    return
  }
  const out = await door.check(code)
  if (out.result === 'reference' && out.reference) return admitBooking(out.reference)
  const said = describe(out)
  show({ ...said, line: `${said.line} ${t('box-office.live-door.checked-here')}` })
}

async function scan(code: string) {
  if (!code.trim()) return
  group.value = null
  if (!online.value) return scanOffline(code)
  try {
    const out = await $api<Scan>(`${base.value}/scan`, { method: 'POST', body: { code: code.trim() } })
    if (out.result === 'reference' && out.reference) return admitBooking(out.reference)
    show(describe(out))
    if (out.result === 'admitted' || out.result === 'already_admitted') await door.noteIn(code)
    if (out.result === 'admitted') await refresh()
  }
  catch (e) {
    // The connection dropped between the check and the answer: the device checks it instead.
    if (!online.value || (e as { statusCode?: number }).statusCode === undefined) return scanOffline(code)
    const refusal = toRefusal(e)
    show({ tone: 'error', icon: ICONS.error, headline: t('box-office.live-door.result.problem'), line: refusal.reason, at: Date.now() })
  }
}

// "Admit anyway", with a reason from the theatre's list.
const overriding = ref(false)
const reasons = ref<Term[]>([])
const reasonId = ref<string | undefined>()
const overrideBusy = ref(false)
async function openOverride() {
  reasonId.value = undefined
  overriding.value = true
  if (!reasons.value.length) reasons.value = (await $api<{ terms: Term[] }>('/api/core/vocabularies/box-office.override-reason/terms')).terms
}
async function admitAnyway() {
  const target = shown.value?.override
  if (!target || !reasonId.value) return
  overrideBusy.value = true
  try {
    const out = await $api<Scan>(`${base.value}/door/override`, { method: 'POST', body: { ticketId: target.ticketId, reasonTermId: reasonId.value } })
    const reason = reasons.value.find(r => r.id === reasonId.value)?.label ?? ''
    overriding.value = false
    show(out.result === 'admitted'
      ? { tone: 'success', icon: ICONS.success, headline: t('box-office.live-door.result.admitted_by_override'), line: t('box-office.live-door.line.admitted_by_override', { type: target.ticketType, reason }), at: Date.now() }
      : describe(out))
    await refresh()
  }
  catch (e) {
    overriding.value = false
    show({ tone: 'error', icon: ICONS.error, headline: t('box-office.live-door.result.problem'), line: toRefusal(e).reason, at: Date.now() })
  }
  finally {
    overrideBusy.value = false
  }
}

// One box for whatever the buyer has instead of a code the camera reads: a ticket's code typed in,
// a booking reference, or their name. Bookings that match are listed as it is typed; one entered
// with nothing matching is checked as a ticket code.
const finding = ref(false)
const query = ref('')
const found = ref<Row[] | null>(null)
const admitting = ref<string | null>(null)
const search = useDebounceFn(async () => {
  const q = query.value.trim()
  if (!q) {
    found.value = null
    return
  }
  if (!online.value) {
    found.value = door.find(q)
    return
  }
  try {
    found.value = (await $api<{ rows: Row[] }>(`${base.value}/door`, { query: { q } })).rows
  }
  catch {
    found.value = []
  }
}, 300) // not-policy: typing pause before searching
watch(query, () => { void search() })
async function submitQuery() {
  const code = query.value.trim()
  if (!code) return
  await search()
  // A name with nobody found stays a search: only something shaped like a code is checked as one.
  if (found.value?.length || !CODE.test(code)) return
  query.value = ''
  found.value = null
  finding.value = false
  await scan(code)
}

async function admit(row: Row, count: number): Promise<number> {
  if (!online.value) {
    const admitted = door.admit(row.id, count)
    show({ tone: admitted ? 'success' : 'warning', icon: ICONS[admitted ? 'success' : 'warning'], headline: t(admitted ? 'box-office.live-door.result.admitted' : 'box-office.live-door.result.already_admitted'), line: `${t('box-office.door.admitted-now', { count: admitted })} ${t('box-office.live-door.checked-here')}`, at: Date.now(), who: `${nameOf(row)} · ${row.reference}` })
    await search()
    return admitted
  }
  admitting.value = row.id
  try {
    const { admitted } = await $api<{ admitted: number }>(`${base.value}/door/admit`, { method: 'POST', body: { orderId: row.id, count } })
    door.noteAdmitted(row.id, admitted)
    show({ tone: admitted ? 'success' : 'warning', icon: ICONS[admitted ? 'success' : 'warning'], headline: t(admitted ? 'box-office.live-door.result.admitted' : 'box-office.live-door.result.already_admitted'), line: t('box-office.door.admitted-now', { count: admitted }), at: Date.now(), who: `${nameOf(row)} · ${row.reference}` })
    await refresh()
    await search()
    return admitted
  }
  catch (e) {
    const refusal = toRefusal(e)
    show({ tone: 'error', icon: ICONS.error, headline: t('box-office.live-door.result.problem'), line: refusal.reason, at: Date.now() })
    return 0
  }
  finally {
    admitting.value = null
  }
}
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col">
    <PageLive
      :title="t('box-office.live-door.title')"
      :context="context"
      back="/live/door"
    >
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <div class="flex flex-1 flex-col gap-3 lg:flex-row">
            <div class="flex flex-1 flex-col gap-3">
              <p class="flex flex-wrap items-baseline gap-x-2">
                <span class="whitespace-nowrap text-3xl font-bold">{{ t('box-office.live-door.count', { admitted: (counts ?? d).admitted, tickets: (counts ?? d).tickets + (counts ?? d).unpaid }) }}</span>
                <span class="text-muted">{{ t('box-office.live-door.to-come', { count: (counts ?? d).tickets + (counts ?? d).unpaid - (counts ?? d).admitted }) }}<template v-if="(counts ?? d).unpaid"> · {{ t('box-office.live-door.unpaid', { count: (counts ?? d).unpaid }) }}</template></span>
              </p>
              <LatecomersNote
                v-if="d.performance.latecomers"
                :rule="d.performance.latecomers"
                staff
              />
              <!-- With no camera there is nothing to frame: the area collapses to the result and the warning. -->
              <section
                class="flex"
                :class="problem ? 'flex-col gap-3' : 'relative min-h-[55vh] flex-1 items-center justify-center overflow-hidden rounded-lg bg-black lg:min-h-[70vh]'"
                :aria-label="t('core.scan.camera')"
              >
                <video
                  v-show="running && !problem"
                  ref="video"
                  class="absolute inset-0 size-full object-cover"
                  muted
                  playsinline
                  :aria-label="t('core.scan.camera')"
                />
                <div
                  v-if="running && !problem"
                  class="pointer-events-none relative aspect-square w-3/5 max-w-80 rounded-2xl border-4"
                  :class="shown ? FRAME[shown.tone] : 'border-white/80'"
                  aria-hidden="true"
                />
                <p
                  v-if="starting"
                  class="absolute inset-x-0 bottom-1/4 text-center text-sm text-white"
                >
                  {{ t('core.scan.starting') }}
                </p>
                <p
                  v-if="!running && !problem"
                  class="text-lg text-white"
                >
                  {{ t('box-office.live-door.paused') }}
                </p>
                <UAlert
                  v-if="problem"
                  class="order-last"
                  color="warning"
                  icon="i-lucide-camera-off"
                  role="alert"
                  :title="t(`core.scan.problem.${problem}`)"
                  :description="t('core.scan.problem.type-below')"
                />
                <div
                  role="status"
                  aria-live="polite"
                  :class="problem ? undefined : 'absolute inset-x-3 top-3'"
                >
                  <div
                    v-if="shown"
                    :key="shown.at"
                    class="door-result-in flex items-center gap-3 rounded-xl p-4 shadow-lg"
                    :class="BANNER[shown.tone]"
                  >
                    <UIcon
                      :name="shown.icon"
                      class="size-9 shrink-0"
                    />
                    <span class="flex flex-col">
                      <strong class="text-2xl">{{ shown.headline }}</strong>
                      <span class="text-base">{{ shown.line }}</span>
                    </span>
                  </div>
                  <p
                    v-else-if="running && !problem"
                    class="rounded-lg bg-black/60 p-3 text-center text-white"
                  >
                    {{ t('box-office.live-door.ready') }}
                  </p>
                </div>
              </section>
              <div
                v-if="group"
                class="grid gap-3"
                :class="group.tickets - group.admitted > 1 ? 'grid-cols-2' : 'grid-cols-1'"
              >
                <UButton
                  icon="i-lucide-user-check"
                  color="neutral"
                  variant="outline"
                  size="xl"
                  block
                  :loading="admitting === group.id"
                  :label="t('box-office.door.admit-one')"
                  :aria-label="t('box-office.door.admit-one-of', { reference: group.reference })"
                  @click="admitFromGroup(1)"
                />
                <UButton
                  v-if="group.tickets - group.admitted > 1"
                  icon="i-lucide-users"
                  size="xl"
                  block
                  :loading="admitting === group.id"
                  :label="t('box-office.door.admit-all', { count: group.tickets - group.admitted })"
                  :aria-label="t('box-office.door.admit-all-of', { count: group.tickets - group.admitted, reference: group.reference })"
                  @click="admitFromGroup(group.tickets - group.admitted)"
                />
              </div>
              <UButton
                v-if="shown?.collect && tillTo(shown.collect)"
                icon="i-lucide-hand-coins"
                color="neutral"
                variant="outline"
                size="xl"
                block
                :to="tillTo(shown.collect)"
                :label="t('box-office.live-door.send-to-till')"
              />
              <UButton
                v-if="shown?.override"
                icon="i-lucide-shield-check"
                color="neutral"
                variant="outline"
                size="xl"
                block
                :label="t('box-office.live-door.override.button')"
                @click="openOverride"
              />
            </div>
            <aside
              v-if="recent.length"
              class="flex flex-col gap-2 lg:w-80"
              aria-labelledby="door-recent"
            >
              <h2
                id="door-recent"
                class="text-sm font-semibold text-muted"
              >
                {{ t('box-office.live-door.recent') }}
              </h2>
              <ul class="flex flex-col gap-2">
                <li
                  v-for="r in recent"
                  :key="r.at"
                  class="flex items-center justify-between gap-2 rounded-md border border-default p-2 text-sm"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <UIcon
                      :name="r.icon"
                      :class="TEXT[r.tone]"
                      class="size-5 shrink-0"
                    />
                    <span class="flex min-w-0 flex-col">
                      <span>{{ r.headline }}</span>
                      <span
                        v-if="r.who"
                        class="truncate text-muted"
                      >{{ r.who }}</span>
                    </span>
                  </span>
                  <span class="text-muted">{{ time(r.at) }}</span>
                </li>
              </ul>
            </aside>
          </div>
        </template>
      </DataBoundary>

      <template #footer>
        <div
          class="mx-auto grid max-w-4xl gap-3"
          :class="problem ? 'grid-cols-1' : 'grid-cols-2'"
        >
          <UButton
            icon="i-lucide-search"
            color="neutral"
            variant="outline"
            size="xl"
            class="flex-col justify-center gap-1 text-sm sm:flex-row sm:gap-2 sm:text-base"
            :label="t('box-office.live-door.find')"
            @click="finding = true"
          />
          <!-- With no camera there is nothing to pause. -->
          <UButton
            v-if="!problem"
            :icon="running ? 'i-lucide-pause' : 'i-lucide-play'"
            color="neutral"
            variant="outline"
            size="xl"
            class="flex-col justify-center gap-1 text-sm sm:flex-row sm:gap-2 sm:text-base"
            :label="running ? t('box-office.live-door.pause') : t('box-office.live-door.resume')"
            @click="running = !running"
          />
        </div>
      </template>
    </PageLive>

    <UModal
      v-model:open="overriding"
      :title="t('box-office.live-door.override.title')"
      :description="shown?.override ? t('box-office.live-door.override.description', { type: shown.override.ticketType, reason: shown.override.reason ?? '' }) : undefined"
    >
      <template #body>
        <UForm
          class="space-y-4"
          :state="{ reasonId }"
          :validate="() => needs({ reasonId })"
          novalidate
          @submit="admitAnyway"
        >
          <UFormField
            name="reasonId"
            :label="t('box-office.live-door.override.reason')"
            required
          >
            <USelect
              v-model="reasonId"
              :items="reasons"
              value-key="id"
              label-key="label"
              size="xl"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              :label="t('core.form.cancel')"
              @click="overriding = false"
            />
            <UButton
              type="submit"
              size="xl"
              :loading="overrideBusy"
              :label="t('box-office.live-door.override.confirm')"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <USlideover
      v-model:open="finding"
      :title="t('box-office.live-door.find')"
    >
      <template #body>
        <div class="space-y-4">
          <UForm
            class="flex items-end gap-2"
            :state="{ query }"
            novalidate
            @submit="submitQuery"
          >
            <UFormField
              :label="t('box-office.live-door.find-label')"
              :help="t('box-office.live-door.find-help')"
              class="grow"
            >
              <UInput
                v-model="query"
                size="xl"
                icon="i-lucide-search"
                autocomplete="off"
                autofocus
              />
            </UFormField>
          </UForm>
          <p
            v-if="!online"
            class="text-sm text-muted"
          >
            {{ door.madeAt.value ? t('box-office.live-door.copy-from', { time: time(door.madeAt.value) }) : t('box-office.live-door.no-copy') }}
          </p>
          <p
            v-if="found && !found.length"
            class="text-muted"
          >
            {{ t('box-office.live-door.find-none') }}
          </p>
          <ul
            v-else-if="found"
            class="divide-y divide-default"
          >
            <li
              v-for="row in found"
              :key="row.id"
              class="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span class="flex flex-col">
                <span class="font-medium">{{ nameOf(row) }}</span>
                <span
                  v-if="row.unpaid"
                  class="flex flex-wrap items-center gap-2 text-sm text-muted"
                >
                  <StatusBadge
                    tone="info"
                    :label="t('box-office.live-door.result.not_paid')"
                  />
                  {{ row.reference }} · {{ t('box-office.live-door.owed', { count: row.tickets, amount: money(row.unpaid.amountDueMinor, row.unpaid.currency) }) }}
                </span>
                <span
                  v-else
                  class="text-sm text-muted"
                >{{ row.reference }} · {{ t('box-office.door.admitted', { admitted: row.admitted, tickets: row.tickets }) }}</span>
              </span>
              <UButton
                v-if="row.unpaid && tillTo(row.reference)"
                icon="i-lucide-hand-coins"
                color="neutral"
                variant="outline"
                size="lg"
                :to="tillTo(row.reference)"
                :label="t('box-office.live-door.send-to-till')"
                :aria-label="t('box-office.live-door.send-to-till-of', { reference: row.reference })"
              />
              <span
                v-else-if="row.unpaid"
                class="text-sm"
              >{{ t('box-office.live-door.pay-at-till') }}</span>
              <span
                v-else-if="row.admitted < row.tickets"
                class="flex gap-2"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  size="lg"
                  :loading="admitting === row.id"
                  :label="t('box-office.door.admit-one')"
                  :aria-label="t('box-office.door.admit-one-of', { reference: row.reference })"
                  @click="admit(row, 1)"
                />
                <UButton
                  v-if="row.tickets - row.admitted > 1"
                  size="lg"
                  :loading="admitting === row.id"
                  :label="t('box-office.door.admit-all', { count: row.tickets - row.admitted })"
                  :aria-label="t('box-office.door.admit-all-of', { count: row.tickets - row.admitted, reference: row.reference })"
                  @click="admit(row, row.tickets - row.admitted)"
                />
              </span>
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <!-- The paper fallback, printed before the doors open. -->
        <UButton
          :to="`/live/door/${encodeURIComponent(id)}/print`"
          icon="i-lucide-printer"
          color="neutral"
          variant="ghost"
          size="lg"
          :label="t('box-office.live-door.print')"
        />
      </template>
    </USlideover>
  </div>
</template>

<style>
/* Each result springs in, so a second ticket like the first still looks new. */
@keyframes door-result-in {
  0% { transform: scale(0.9); opacity: 0.3; }
  60% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: no-preference) {
  .door-result-in { animation: door-result-in 350ms ease-out; }
}
</style>
