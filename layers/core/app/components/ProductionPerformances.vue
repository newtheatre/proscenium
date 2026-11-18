<script setup lang="ts">
import { noOverrides, overrideErrors, slotsInWords, type RunSlot, type ShowDefaultValues, type ShowOverrides } from '../utils/show-defaults'
import { parseTime } from '@internationalized/date'
// A production's performances (C-03 to C-07, C-10): added one at a time or as a run (C-04), scheduled
// into a free space, changed, cancelled with a reason and reinstated. A change with a wide reach shows what it touches
// first, and a module that refuses it says why. Times are shown and entered in the theatre's time
// zone, whatever the viewer's. The list is grouped by week, and rows can be selected to change the
// time, set access or cancel several at once.
type State = 'draft' | 'scheduled' | 'cancelled' | 'completed'
interface Performance {
  id: string
  venueId: string
  spaceId: string
  startsAt: number
  doorsAt: number | null
  endsAt: number
  intervalCount: number | null
  intervalMinutes: number | null
  capacity: number | null
  label: string | null
  externalBookingUrl: string | null
  state: State
  cancelReasonTermId: string | null
  cancelNote: string | null
  access: { termId: string, detail: string | null }[]
  effectsOff: string[]
}
interface Option { id: string, label: string, retired: boolean }
interface Run { id: string, total: number, done: number, state: 'running' | 'stopped' | 'done' | 'removing' | 'removed', stopReason: string | null, scheduled: boolean }
interface EditableRun { id: string, venueId: string, spaceId: string, scheduled: boolean, pattern: { from: string, to: string, slots: RunSlot[], minutes?: number | null, doorsBeforeMinutes?: number | null }, count: number, performanceIds: string[] }
interface Answer {
  performances: Performance[]
  runs: Run[]
  editableRuns: EditableRun[]
  season: { startsOn: string, endsOn: string } | null
  options: {
    venues: { id: string, name: string, spaces: { id: string, name: string, defaultCapacity: number | null, doorsBeforeMinutes: number | null, runPresetId: string | null }[] }[]
    access: Option[]
    reasons: Option[]
    effects: { id: string, label: string }[]
    presets: { id: string, name: string, slots: RunSlot[] }[]
  }
  defaults: ShowDefaultValues & { productionDoorsBeforeMinutes: number | null, productionCapacity: number | null, theatreDoorsBeforeMinutes: number, usualPreset: string | null, scheduleRuns: boolean, sellsHere: boolean }
}
type Kind = 'cancel' | 'reschedule' | 'move' | 'capacity'
interface Reach { lines: string[], refusal: { code: string, reason: string, link: string | null } | null }

const { t } = useT()
const props = defineProps<{ productionId: string, title: string }>()
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<Answer>(() => `/api/core/productions/${props.productionId}/performances`, { key: `core:production:${props.productionId}:performances` })
const dates = useDates()
// Whole-day closures that block performances grey out their days in the date fields; the server still decides.
const { data: closures } = useAPI<{ rows: { venueId: string | null, spaceId: string | null, startsAt: number, endsAt: number, allDay: boolean, blocksPerformances: boolean }[] }>('/api/core/closures', { key: 'core:closures', lazy: true, server: false })
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const TONES = { draft: 'neutral', scheduled: 'success', cancelled: 'danger', completed: 'info' } as const
const performances = computed(() => data.value?.performances ?? [])
// A space named as its venue is shown by the venue's name alone.
const spaces = computed(() => (data.value?.options.venues ?? []).flatMap(v => v.spaces.map(s => ({ value: s.id, label: s.name === v.name ? v.name : `${s.name}, ${v.name}`, venueId: v.id, capacity: s.defaultCapacity, doorsBeforeMinutes: s.doorsBeforeMinutes, runPresetId: s.runPresetId }))))
/** What a performance in this space takes when it says nothing: the production's own over the space's over the theatre's. */
function defaultsIn(spaceId: string): ShowDefaultValues {
  const d = data.value!.defaults
  const s = spaces.value.find(x => x.value === spaceId)
  return {
    runningMinutes: d.runningMinutes,
    doorsBeforeMinutes: d.productionDoorsBeforeMinutes ?? s?.doorsBeforeMinutes ?? d.theatreDoorsBeforeMinutes,
    intervalCount: d.intervalCount,
    intervalMinutes: d.intervalMinutes,
    capacity: d.productionCapacity ?? s?.capacity ?? null,
    externalBookingUrl: d.externalBookingUrl,
  }
}
const place = (p: Performance) => spaces.value.find(s => s.value === p.spaceId)?.label ?? 'A space no longer listed'
/** Whether every performance is in the one space, which is then said once above the list. */
const oneSpace = computed(() => new Set(performances.value.map(p => p.spaceId)).size === 1)
/** Where (unless there is only one space), doors, end and seats, on one line. */
const summaryOf = (p: Performance) => [...(oneSpace.value ? [] : [place(p)]), ...(p.doorsAt ? [`doors ${dates.time(p.doorsAt)}`] : []), `ends ${dates.time(p.endsAt)}`, ...(p.capacity !== null ? [`${p.capacity} seats`] : [])].join(' · ')
const accessLabel = (id: string) => data.value?.options.access.find(a => a.id === id)?.label ?? 'Access'
const thing = (p: Performance) => `the ${dates.time(p.startsAt)} performance of ${props.title} on ${dates.dayNamed(p.startsAt)}`
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Grouped by the week each starts in, Monday first, in the theatre's time zone.
const DAY_MS = 86_400_000 // not-policy: milliseconds in a day
const DATE_LENGTH = 10 // not-policy: the length of a date, YYYY-MM-DD
function mondayOf(p: Performance): string {
  const local = dates.toLocal(p.startsAt).slice(0, DATE_LENGTH)
  const at = Date.parse(`${local}T00:00:00Z`)
  const weekday = new Date(at).getUTCDay() || 7 // not-policy: Sunday is 7, ISO style
  return new Date(at - (weekday - 1) * DAY_MS).toISOString().slice(0, DATE_LENGTH)
}
const weeks = computed(() => {
  const list: { monday: string, label: string, rows: Performance[] }[] = []
  for (const p of performances.value) {
    const monday = mondayOf(p)
    const last = list.at(-1)
    if (last?.monday === monday) last.rows.push(p)
    else list.push({ monday, label: `Week of ${dates.day(monday)}`, rows: [p] })
  }
  return list
})

// A form's own save passes the form, so what the server refuses shows beside each field.
async function run(fn: () => Promise<unknown>, done?: string, form?: { setErrors: (errors: { name: string, message: string }[]) => void } | null): Promise<boolean> {
  refusal.value = null
  try {
    const answer = await fn() as { warnings?: string[] } | undefined
    await refresh()
    emit('changed')
    if (answer?.warnings?.length) toast.add({ title: done ?? 'Saved', description: `Note: ${answer.warnings.join(', ')}.`, color: 'warning' })
    else if (done) toast.add({ title: done, color: 'success' })
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form?.setErrors(fieldErrors(refusal.value))
    return false
  }
}
const call = (id: string, path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}) =>
  $api<unknown>(`/api/core/performances/${id}${path}` as string, { method, body })

/** What a change touches and whether a module refuses it, for the confirmation. */
function reach(id: string, kind: Kind): Promise<Reach> {
  return $api<Reach>(`/api/core/performances/${id}/impact` as string, { query: { kind } })
}

// Adding and editing
const editing = ref<Performance | null>(null)
const MINUTE = 60_000 // not-policy: milliseconds in a minute
const open = ref(false)
const form = ref({ spaceId: '', startsAt: null as number | null })
const overrides = ref<ShowOverrides>(noOverrides())
const shown = computed(() => form.value.spaceId && data.value ? defaultsIn(form.value.spaceId) : null)
/** Whether a whole-day closure that blocks performances covers this day for the chosen space. */
function closed(day: string): boolean {
  const space = spaces.value.find(x => x.value === form.value.spaceId)
  return (closures.value?.rows ?? []).some(c => c.allDay && c.blocksPerformances
    && (!c.venueId || (c.venueId === space?.venueId && (!c.spaceId || c.spaceId === space.value)))
    && dates.toLocal(c.startsAt).slice(0, 10) <= day && day <= dates.toLocal(c.endsAt - 1).slice(0, 10)) // not-policy: the length of a date
}
// Checked beside each field: a space, a start, and a booking link that is a web address.
const performanceForm = useTemplateRef('performanceForm')
function checkPerformance() {
  const needed = (name: string) => ({ name, message: translate('core.form.invalid.required') })
  return [
    ...(form.value.spaceId ? [] : [needed('spaceId')]),
    ...(form.value.startsAt ? [] : [needed('startsAt')]),
    ...overrideErrors(overrides.value, shown.value, !!data.value?.defaults.sellsHere),
  ]
}
function start(p: Performance | null) {
  refusal.value = null
  editing.value = p
  form.value = { spaceId: p?.spaceId ?? spaces.value[0]?.value ?? '', startsAt: p?.startsAt ?? null }
  overrides.value = noOverrides()
  if (p) {
    // A performance shows as changed only where it differs from the show's defaults.
    const d = defaultsIn(p.spaceId)
    const running = Math.round((p.endsAt - p.startsAt) / MINUTE)
    const doors = p.doorsAt === null ? null : Math.round((p.startsAt - p.doorsAt) / MINUTE)
    overrides.value = {
      runningMinutes: running === d.runningMinutes ? null : running,
      doorsBeforeMinutes: doors === null || doors === d.doorsBeforeMinutes ? null : doors,
      intervalCount: p.intervalCount,
      intervalMinutes: p.intervalMinutes,
      capacity: p.capacity,
      label: p.label ?? '',
      bookedElsewhere: !!p.externalBookingUrl,
      externalBookingUrl: p.externalBookingUrl ?? '',
    }
  }
  open.value = true
}
async function save() {
  const space = spaces.value.find(s => s.value === form.value.spaceId)
  if (!space) return
  const o = overrides.value
  const d = defaultsIn(space.value)
  const body: Record<string, unknown> = {
    venueId: space.venueId,
    spaceId: space.value,
    startsAt: form.value.startsAt,
    capacity: o.capacity,
    intervalCount: o.intervalCount,
    intervalMinutes: o.intervalMinutes,
    label: o.label,
    externalBookingUrl: o.bookedElsewhere ? o.externalBookingUrl.trim() || null : null,
    // Left empty, the end and doors come from the show's defaults; an edit always sends them, so the end moves with the start.
    runningMinutes: o.runningMinutes ?? (editing.value ? d.runningMinutes : null),
    doorsBeforeMinutes: o.doorsBeforeMinutes ?? (editing.value ? d.doorsBeforeMinutes : null),
  }
  const p = editing.value
  if (!p) {
    if (await run(() => $api<unknown>(`/api/core/productions/${props.productionId}/performances` as string, { method: 'POST', body }), 'Performance added', performanceForm.value)) open.value = false
    return
  }
  if (p.state === 'scheduled') {
    const kinds: Kind[] = []
    const endsAt = form.value.startsAt! + (body.runningMinutes as number) * MINUTE
    if (form.value.startsAt !== p.startsAt || endsAt !== p.endsAt) kinds.push('reschedule')
    if (form.value.spaceId !== p.spaceId) kinds.push('move')
    if (o.capacity !== p.capacity) kinds.push('capacity')
    const reached = await Promise.all(kinds.map(k => reach(p.id, k)))
    const refused = reached.find(r => r.refusal)?.refusal
    if (refused) {
      refusal.value = { code: refused.code, reason: refused.reason, remedy: refused.link ?? undefined } as ReturnType<typeof toRefusal>
      return
    }
    const lines = reached.flatMap(r => r.lines)
    if (lines.length && !await confirm({ verb: 'Change', thing: thing(p), consequence: lines.join(' '), button: 'Change performance' })) return
  }
  if (await run(() => call(p.id, '', 'PATCH', body), 'Performance saved', performanceForm.value)) open.value = false
}

// Moves
const schedule = (p: Performance) => run(() => call(p.id, '/schedule', 'POST'), 'Performance scheduled')
const reinstate = (p: Performance) => run(() => call(p.id, '/reinstate', 'POST'), 'Performance reinstated')
async function remove(p: Performance) {
  if (!await confirm({ verb: 'Delete', thing: thing(p), consequence: 'The draft is removed for good.', button: 'Delete performance' })) return
  await run(() => call(p.id, '', 'DELETE'), 'Performance deleted')
}

// Cancelling
const cancelling = ref<Performance | null>(null)
const cancelOpen = computed({ get: () => !!cancelling.value, set: (v) => { if (!v) cancelling.value = null } })
const cancelForm = ref({ reasonTermId: '', note: '' })
const cancelReach = ref<Reach | null>(null)
const reasons = computed(() => (data.value?.options.reasons ?? []).map(r => ({ value: r.id, label: r.label })))
async function startCancel(p: Performance) {
  refusal.value = null
  cancelForm.value.reasonTermId = ''
  cancelForm.value.note = ''
  cancelReach.value = null
  cancelling.value = p
  try {
    cancelReach.value = await reach(p.id, 'cancel')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function cancel() {
  const p = cancelling.value
  if (!p) return
  if (await run(() => call(p.id, '/cancel', 'POST', { reasonTermId: cancelForm.value.reasonTermId, note: cancelForm.value.note }), 'Performance cancelled')) cancelling.value = null
}

// Access features
const accessFor = ref<Performance | null>(null)
const accessOpen = computed({ get: () => !!accessFor.value, set: (v) => { if (!v) accessFor.value = null } })
const accessChosen = ref<Record<string, { on: boolean, detail: string }>>({})
const shownAccess = computed(() => (data.value?.options.access ?? []).filter(a => !a.retired || accessChosen.value[a.id]?.on))
function startAccess(p: Performance) {
  refusal.value = null
  for (const a of data.value?.options.access ?? []) {
    const row = p.access.find(x => x.termId === a.id)
    accessChosen.value[a.id] = { on: !!row, detail: row?.detail ?? '' }
  }
  accessFor.value = p
}
async function saveAccess() {
  const p = accessFor.value
  if (!p) return
  const features = shownAccess.value.filter(a => accessChosen.value[a.id]?.on).map(a => ({ termId: a.id, detail: accessChosen.value[a.id]!.detail.trim() || null }))
  if (await run(() => call(p.id, '/access', 'PUT', { features }), 'Access saved')) accessFor.value = null
}

// Staging effects not used at one performance (C-55)
const effectsFor = ref<Performance | null>(null)
const effectsOpen = computed({ get: () => !!effectsFor.value, set: (v) => { if (!v) effectsFor.value = null } })
const effectsOff = ref<Record<string, boolean>>({})
const productionEffects = computed(() => data.value?.options.effects ?? [])
function startEffects(p: Performance) {
  refusal.value = null
  effectsOff.value = Object.fromEntries(productionEffects.value.map(e => [e.id, p.effectsOff.includes(e.id)]))
  effectsFor.value = p
}
async function saveEffects() {
  const p = effectsFor.value
  if (!p) return
  const termIds = productionEffects.value.filter(e => effectsOff.value[e.id]).map(e => e.id)
  if (await run(() => call(p.id, '/effects', 'PUT', { termIds }), 'Staging effects saved')) effectsFor.value = null
}

// Several at once: rows that can still change are selected, then their time, access or
// (for scheduled ones) the performance itself is changed for every one, one request each.
const selected = ref<Set<string>>(new Set())
const selectable = (p: Performance) => p.state === 'draft' || p.state === 'scheduled'
const chosen = computed(() => performances.value.filter(p => selected.value.has(p.id) && selectable(p)))
const chosenScheduled = computed(() => chosen.value.filter(p => p.state === 'scheduled'))
function toggle(ids: string[], on: boolean) {
  const next = new Set(selected.value)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  selected.value = next
}
/** Ticked, unticked or some of them, for a week's or the whole list's box. */
function tickState(rows: Performance[]): boolean | 'indeterminate' {
  const ids = rows.filter(selectable).map(p => p.id)
  const on = ids.filter(id => selected.value.has(id)).length
  return on === 0 ? false : on === ids.length ? true : 'indeterminate'
}
// A performance that has gone or can no longer change drops out of the selection.
watch(performances, (list) => {
  const still = new Set(list.filter(selectable).map(p => p.id))
  if ([...selected.value].some(id => !still.has(id))) selected.value = new Set([...selected.value].filter(id => still.has(id)))
})
const counted = (n: number) => n === 1 ? '1 performance' : `${n} performances`

/** Each change in turn; says how many worked and why the first that failed did not. */
async function eachOf<T>(rows: T[], fn: (row: T) => Promise<unknown>): Promise<{ done: T[], failed: number, reason: string | null }> {
  const done: T[] = []
  let failed = 0
  let reason: string | null = null
  for (const row of rows) {
    try {
      await fn(row)
      done.push(row)
    }
    catch (e) {
      failed++
      reason ??= toRefusal(e).reason
    }
  }
  return { done, failed, reason }
}
/** Each in turn, stopping at the first that fails, for an Undo that should say so. */
async function everyOf<T>(rows: T[], fn: (row: T) => Promise<unknown>) {
  for (const row of rows) await fn(row)
}
async function afterBulk(result: { done: unknown[], failed: number, reason: string | null }, message: string, undo?: () => Promise<unknown>) {
  await refresh()
  emit('changed')
  if (result.failed) toast.add({ title: `${message}; ${counted(result.failed)} could not be changed`, description: result.reason ?? undefined, color: 'warning' })
  else offer(message, undo && (async () => {
    await undo()
    await refresh()
    emit('changed')
  }))
}

// A new start time for every selected performance, each on its own day; the end and doors move with it.
const bulkTime = ref<{ open: boolean, time: string }>({ open: false, time: '' })
const bulkBusy = ref(false)
function startBulkTime() {
  refusal.value = null
  const first = chosen.value[0]
  bulkTime.value = { open: true, time: first ? dates.toLocal(first.startsAt).slice(11, 16) : '' } // not-policy: positions in YYYY-MM-DDTHH:mm
}
function timeValue(value: string) {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
function timeOf(value: unknown) {
  bulkTime.value.time = value ? String(value).slice(0, 5) : '' // not-policy: HH:mm
}
async function saveBulkTime() {
  const time = bulkTime.value.time
  const rows = chosen.value
  const was = rows.map(p => ({ p, startsAt: p.startsAt, minutes: Math.round((p.endsAt - p.startsAt) / MINUTE) }))
  const moving = was.filter(w => dates.toLocal(w.startsAt).slice(11, 16) !== time) // not-policy: positions in YYYY-MM-DDTHH:mm
  refusal.value = null
  if (!moving.length) {
    bulkTime.value.open = false
    return
  }
  bulkBusy.value = true
  try {
    // What the scheduled ones would touch, in one confirmation; a module's refusal stops it all.
    const reached = await Promise.all(moving.filter(w => w.p.state === 'scheduled').map(w => reach(w.p.id, 'reschedule')))
    const refused = reached.find(x => x.refusal)?.refusal
    if (refused) {
      refusal.value = { code: refused.code, reason: refused.reason, remedy: refused.link ?? undefined } as ReturnType<typeof toRefusal>
      return
    }
    const lines = [...new Set(reached.flatMap(x => x.lines))]
    if (lines.length && !await confirm({ verb: 'Change', thing: `the time of ${counted(moving.length)}`, consequence: lines.join(' '), button: 'Change the time' })) return
    const result = await eachOf(moving, w => call(w.p.id, '', 'PATCH', { startsAt: `${dates.toLocal(w.startsAt).slice(0, 10)}T${time}`, runningMinutes: w.minutes })) // not-policy: the length of a date
    bulkTime.value.open = false
    await afterBulk(result, `Time changed for ${counted(result.done.length)}`, () => everyOf(result.done, w => call(w.p.id, '', 'PATCH', { startsAt: w.startsAt, runningMinutes: w.minutes })))
  }
  finally {
    bulkBusy.value = false
  }
}

// Access features for every selected performance: a box ticked for some of them leaves each as it is.
const bulkAccess = ref<{ open: boolean, chosen: Record<string, { on: boolean | 'indeterminate', detail: string }> }>({ open: false, chosen: {} })
const bulkAccessShown = computed(() => (data.value?.options.access ?? []).filter(a => !a.retired || bulkAccess.value.chosen[a.id]?.on !== false))
function startBulkAccess() {
  refusal.value = null
  const chosenRows: Record<string, { on: boolean | 'indeterminate', detail: string }> = {}
  for (const a of data.value?.options.access ?? []) {
    const having = chosen.value.filter(p => p.access.some(x => x.termId === a.id))
    const details = new Set(having.map(p => p.access.find(x => x.termId === a.id)?.detail ?? ''))
    chosenRows[a.id] = { on: having.length === 0 ? false : having.length === chosen.value.length ? true : 'indeterminate', detail: details.size === 1 ? [...details][0]! : '' }
  }
  bulkAccess.value = { open: true, chosen: chosenRows }
}
async function saveBulkAccess() {
  const rows = chosen.value
  const set = bulkAccess.value.chosen
  const before = rows.map(p => ({ p, features: p.access.map(a => ({ termId: a.termId, detail: a.detail })) }))
  const featuresFor = (p: Performance) => (data.value?.options.access ?? []).flatMap((a) => {
    const own = p.access.find(x => x.termId === a.id)
    const state = set[a.id]?.on ?? false
    if (state === 'indeterminate') return own ? [{ termId: a.id, detail: own.detail }] : []
    if (!state) return []
    return [{ termId: a.id, detail: set[a.id]!.detail.trim() || own?.detail || null }]
  })
  bulkBusy.value = true
  try {
    const result = await eachOf(before, b => call(b.p.id, '/access', 'PUT', { features: featuresFor(b.p) }))
    bulkAccess.value.open = false
    await afterBulk(result, `Access saved for ${counted(result.done.length)}`, () => everyOf(result.done, b => call(b.p.id, '/access', 'PUT', { features: b.features })))
  }
  finally {
    bulkBusy.value = false
  }
}

// Cancelling the selected scheduled performances, with one reason; Undo reinstates them.
const bulkCancel = ref<{ open: boolean, reasonTermId: string, note: string, reach: Reach | null }>({ open: false, reasonTermId: '', note: '', reach: null })
async function startBulkCancel() {
  refusal.value = null
  bulkCancel.value = { open: true, reasonTermId: '', note: '', reach: null }
  try {
    const reached = await Promise.all(chosenScheduled.value.map(p => reach(p.id, 'cancel')))
    bulkCancel.value.reach = { lines: [...new Set(reached.flatMap(x => x.lines))], refusal: reached.find(x => x.refusal)?.refusal ?? null }
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function saveBulkCancel() {
  const rows = chosenScheduled.value
  bulkBusy.value = true
  try {
    const result = await eachOf(rows, p => call(p.id, '/cancel', 'POST', { reasonTermId: bulkCancel.value.reasonTermId, note: bulkCancel.value.note }))
    bulkCancel.value.open = false
    await afterBulk(result, `${upperFirst(counted(result.done.length))} cancelled`, () => everyOf(result.done, p => call(p.id, '/reinstate', 'POST')))
  }
  finally {
    bulkBusy.value = false
  }
}

// Runs (C-04). A long run is made by a job; while one is moving the list is refreshed.
const addingRun = ref(false)
const runs = computed(() => data.value?.runs ?? [])
const moving = computed(() => runs.value.some(r => r.state === 'running' || r.state === 'removing'))
let timer: ReturnType<typeof setInterval> | undefined
watch(moving, (on) => {
  if (on && !timer) timer = setInterval(() => refresh(), 3000) // not-policy: how often a moving run's progress is fetched
  if (!on && timer) {
    clearInterval(timer)
    timer = undefined
    emit('changed')
  }
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))
async function added(answer: { created: number, ids: string[] } | { run: { id: string, total: number } }) {
  await refresh()
  emit('changed')
  if (!('created' in answer)) {
    toast.add({ title: `Adding ${answer.run.total} performances`, color: 'success' })
    return
  }
  // Undo removes what the run just added, drafts and scheduled alike.
  offer(t('core.counts.performances-added', { count: answer.created }), async () => {
    await $api<unknown>(`/api/core/productions/${props.productionId}/performances/undo` as string, { method: 'POST', body: { ids: answer.ids } })
    await refresh()
    emit('changed')
  })
}
/** Where a new run's dates start: the day after the last performance, for a week, else the production's season. */
const DAY = 86_400_000 // not-policy: milliseconds in a day
const WEEK = 6 // not-policy: a suggested run's last date, six days after its first
const shiftDay = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY).toISOString().slice(0, 10) // not-policy: the length of a date
const suggestedRun = computed(() => {
  const today = dates.toLocal(Date.now()).slice(0, 10) // not-policy: the length of a date
  const last = performances.value.filter(p => p.state !== 'cancelled').at(-1)
  if (last) {
    const lastDay = dates.toLocal(last.startsAt).slice(0, 10) // not-policy: the length of a date
    const start = shiftDay(lastDay > today ? lastDay : today, 1)
    return { start, end: shiftDay(start, WEEK) }
  }
  const season = data.value?.season
  if (season && season.endsOn > today) return { start: season.startsOn > today ? season.startsOn : shiftDay(today, 1), end: season.endsOn }
  return null
})
const finishRun = (r: Run) => run(() => $api<unknown>(`/api/core/productions/${props.productionId}/runs/${r.id}/finish` as string, { method: 'POST', body: {} }), 'Finishing the run')
async function removeRun(r: Run) {
  if (!await confirm({ verb: 'Remove', thing: `the ${r.done} performances this run added`, consequence: 'Drafts are deleted and scheduled performances are cancelled, as if each were cancelled.', button: 'Remove them' })) return
  await run(() => $api<unknown>(`/api/core/productions/${props.productionId}/runs/${r.id}/remove` as string, { method: 'POST', body: {} }), 'Removing the run')
}

// Editing a whole run that was added in one go: its pattern, with what changes shown first.
const editableRuns = computed(() => data.value?.editableRuns ?? [])
const editingRun = ref<EditableRun | null>(null)
const editRunOpen = ref(false)
const runOf = (p: Performance) => editableRuns.value.find(r => r.performanceIds.includes(p.id)) ?? null
function startEditRun(r: EditableRun) {
  refusal.value = null
  editingRun.value = r
  editRunOpen.value = true
}
async function runEdited() {
  await refresh()
  emit('changed')
}

function actions(p: Performance) {
  const items = []
  const inRun = selectable(p) ? runOf(p) : null
  if (p.state === 'draft') items.push({ label: 'Schedule', icon: 'i-lucide-calendar-check', onSelect: () => schedule(p) })
  if (p.state === 'draft' || p.state === 'scheduled') {
    items.push({ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => start(p) })
    items.push({ label: 'Access', icon: 'i-lucide-accessibility', onSelect: () => startAccess(p) })
    if (productionEffects.value.length) items.push({ label: 'Staging effects', icon: 'i-lucide-zap-off', onSelect: () => startEffects(p) })
    if (inRun) items.push({ label: 'Edit the run', icon: 'i-lucide-calendar-range', onSelect: () => startEditRun(inRun) })
  }
  if (p.state === 'scheduled') items.push({ label: 'Cancel', icon: 'i-lucide-calendar-x', color: 'error' as const, onSelect: () => startCancel(p) })
  if (p.state === 'cancelled' && p.startsAt > Date.now()) items.push({ label: 'Reinstate', icon: 'i-lucide-undo-2', onSelect: () => reinstate(p) })
  if (p.state === 'draft') items.push({ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(p) })
  return items
}
</script>

<template>
  <PageSection
    title="Performances"
    description="Each starts as a draft. Scheduled dates go public when the production is published."
  >
    <template #actions>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Add a run"
          icon="i-lucide-calendar-plus"
          color="neutral"
          variant="outline"
          :disabled="!spaces.length"
          @click="addingRun = true"
        />
        <UButton
          label="Add performance"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          :disabled="!spaces.length"
          @click="start(null)"
        />
      </div>
    </template>
    <UAlert
      v-for="r in runs"
      :key="r.id"
      :color="r.state === 'stopped' ? 'warning' : 'info'"
      variant="subtle"
      :icon="r.state === 'stopped' ? 'i-lucide-triangle-alert' : 'i-lucide-loader'"
      :title="r.state === 'stopped' ? `A run stopped after ${r.done} of ${r.total}` : r.state === 'removing' ? 'Removing a run' : `Adding a run: ${r.done} of ${r.total}`"
      :description="r.stopReason ?? undefined"
      :actions="r.state === 'stopped' ? [{ label: 'Finish it', onClick: () => finishRun(r) }, { label: 'Remove what it added', color: 'error', variant: 'outline', onClick: () => removeRun(r) }] : undefined"
    />
    <p
      v-if="data && !spaces.length"
      class="text-sm text-muted"
    >
      Add a venue with a space that can hold performances first.
    </p>
    <RecordList
      v-if="editableRuns.length"
      label="Runs"
    >
      <RecordListItem
        v-for="r in editableRuns"
        :key="r.id"
        icon="i-lucide-calendar-range"
        :name="`A run of ${r.count === 1 ? '1 performance' : `${r.count} performances`} to come`"
        :description="`${dates.span(r.pattern.from, r.pattern.to)} · ${slotsInWords(r.pattern.slots)}`"
      >
        <UButton
          label="Edit the run"
          color="neutral"
          variant="outline"
          size="sm"
          @click="startEditRun(r)"
        />
      </RecordListItem>
    </RecordList>
    <RefusalNotice
      v-if="!open && !cancelling && !accessFor && !effectsFor && !addingRun && !bulkTime.open && !bulkAccess.open && !bulkCancel.open && !editRunOpen"
      :refusal="refusal"
    />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!performances.length"
        title="No performances yet"
        description="Add each performance as a draft, then schedule it when its time and space are settled."
        icon="i-lucide-calendar"
      />
      <div
        v-else
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <UCheckbox
            :model-value="tickState(performances)"
            :disabled="!performances.some(selectable)"
            :label="chosen.length ? `${counted(chosen.length)} selected` : 'Select all'"
            @update:model-value="toggle(performances.filter(selectable).map(p => p.id), $event === true)"
          />
          <template v-if="chosen.length">
            <UButton
              label="Edit time"
              icon="i-lucide-clock"
              color="neutral"
              variant="outline"
              size="sm"
              @click="startBulkTime"
            />
            <UButton
              label="Access"
              icon="i-lucide-accessibility"
              color="neutral"
              variant="outline"
              size="sm"
              @click="startBulkAccess"
            />
            <UButton
              v-if="chosenScheduled.length"
              :label="chosenScheduled.length === chosen.length ? 'Cancel' : `Cancel the ${chosenScheduled.length} scheduled`"
              icon="i-lucide-calendar-x"
              color="error"
              variant="outline"
              size="sm"
              @click="startBulkCancel"
            />
            <UButton
              label="Clear"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="selected = new Set()"
            />
          </template>
          <span
            v-else-if="oneSpace && performances[0]"
            class="text-muted"
          >All in {{ place(performances[0]) }}.</span>
        </div>
        <section
          v-for="w in weeks"
          :key="w.monday"
          class="space-y-2"
          :aria-label="w.label"
        >
          <UCheckbox
            :model-value="tickState(w.rows)"
            :disabled="!w.rows.some(selectable)"
            :label="w.label"
            :ui="{ label: 'text-sm font-medium text-muted' }"
            @update:model-value="toggle(w.rows.filter(selectable).map(p => p.id), $event === true)"
          />
          <RecordList :label="w.label">
            <RecordListItem
              v-for="p in w.rows"
              :key="p.id"
              :description="summaryOf(p)"
            >
              <template #leading>
                <UCheckbox
                  :model-value="selected.has(p.id)"
                  :disabled="!selectable(p)"
                  :aria-label="`Select ${dates.dateTime(p.startsAt)}`"
                  @update:model-value="toggle([p.id], $event === true)"
                />
              </template>
              <template #name>
                {{ dates.dateTime(p.startsAt) }}<span
                  v-if="p.label"
                  class="font-normal text-muted"
                > · {{ p.label }}</span>
                <UBadge
                  v-for="a in p.access"
                  :key="a.termId"
                  :label="accessLabel(a.termId)"
                  color="neutral"
                  size="sm"
                  class="ms-1"
                />
              </template>
              <StatusBadge
                :tone="TONES[p.state]"
                :label="t(`core.states.${p.state}`)"
              />
              <RowActions
                :items="actions(p)"
                :label="`Actions for ${dates.dateTime(p.startsAt)}`"
                size="md"
              />
            </RecordListItem>
          </RecordList>
        </section>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="editing ? 'Edit performance' : 'Add performance'"
      :description="editing?.state === 'scheduled' ? 'It is scheduled, so a new time or space must be free.' : 'It starts as a draft. Scheduled dates go public when the production is published.'"
    >
      <template #body>
        <UForm
          id="performance-form"
          ref="performanceForm"
          class="space-y-4"
          :state="form"
          :validate="checkPerformance"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Space"
            name="spaceId"
            required
          >
            <USelectMenu
              v-model="form.spaceId"
              value-key="value"
              :items="spaces"
            />
          </UFormField>
          <UFormField
            label="Starts"
            name="startsAt"
            required
          >
            <FieldDateTime
              v-model="form.startsAt"
              :unavailable="closed"
            />
          </UFormField>
          <ShowDefaults
            v-if="shown && open"
            v-model="overrides"
            :defaults="shown"
            :sells-here="data!.defaults.sellsHere"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="performance-form"
          :label="editing ? 'Save performance' : 'Add performance'"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="cancelOpen"
      title="Cancel this performance?"
      :description="cancelling ? `${upperFirst(thing(cancelling))}.` : undefined"
    >
      <template #body>
        <UForm
          id="cancel-performance"
          class="space-y-4"
          :state="cancelForm"
          :validate="() => needs({ reasonTermId: cancelForm.reasonTermId })"
          novalidate
          @submit="cancel"
        >
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="cancelReach?.refusal"
            color="error"
            icon="i-lucide-circle-x"
            :title="cancelReach.refusal.reason"
          >
            <template
              v-if="cancelReach.refusal.link"
              #description
            >
              <ULink :to="cancelReach.refusal.link">
                See what is holding it
              </ULink>
            </template>
          </UAlert>
          <ul
            v-if="cancelReach?.lines.length"
            class="list-disc space-y-1 ps-5 text-sm"
          >
            <li
              v-for="line in cancelReach.lines"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
          <UFormField
            name="reasonTermId"
            label="Reason"
            required
          >
            <USelect
              v-model="cancelForm.reasonTermId"
              :items="reasons"
              placeholder="Choose a reason"
            />
          </UFormField>
          <UFormField
            label="Note"
            help="Kept with the performance, for the team."
          >
            <UTextarea
              v-model="cancelForm.note"
              :rows="2"
              maxlength="200"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep the performance"
            color="neutral"
            variant="outline"
            @click="cancelling = null"
          />
          <UButton
            type="submit"
            form="cancel-performance"
            label="Cancel performance"
            color="error"
            :disabled="!!cancelReach?.refusal"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="bulkTime.open"
      title="Edit the time"
      :description="`A new start time for ${counted(chosen.length)}, each on its own day. The end and doors move with it.`"
    >
      <template #body>
        <UForm
          id="performances-time"
          class="space-y-4"
          :state="bulkTime"
          :validate="() => needs({ time: bulkTime.time })"
          novalidate
          @submit="saveBulkTime"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Starts at"
            name="time"
            required
          >
            <UInputTime
              :model-value="timeValue(bulkTime.time)"
              :hour-cycle="24"
              @update:model-value="timeOf($event)"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="performances-time"
          label="Change the time"
          :loading="bulkBusy"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="bulkAccess.open"
      title="Access at these performances"
      :description="`What ${counted(chosen.length)} offer. A box ticked for only some of them leaves each as it is.`"
    >
      <template #body>
        <UForm
          id="performances-access"
          class="space-y-3"
          :state="bulkAccess.chosen"
          novalidate
          @submit="saveBulkAccess"
        >
          <RefusalNotice :refusal="refusal" />
          <div
            v-for="a in bulkAccessShown"
            :key="a.id"
            class="flex flex-wrap items-center gap-3"
          >
            <UCheckbox
              v-model="bulkAccess.chosen[a.id]!.on"
              :label="a.label"
              class="w-56"
            />
            <UInput
              v-if="bulkAccess.chosen[a.id]!.on === true"
              v-model="bulkAccess.chosen[a.id]!.detail"
              placeholder="Detail, such as who provides it"
              :aria-label="`Detail for ${a.label}`"
              maxlength="200"
              size="sm"
              class="flex-1"
            />
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="performances-access"
          label="Save access"
          :loading="bulkBusy"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="bulkCancel.open"
      :title="chosenScheduled.length === 1 ? 'Cancel this performance?' : `Cancel these ${chosenScheduled.length} performances?`"
      description="Only scheduled performances are cancelled. Any drafts in the selection are left as they are."
    >
      <template #body>
        <UForm
          id="cancel-performances"
          class="space-y-4"
          :state="bulkCancel"
          :validate="() => needs({ reasonTermId: bulkCancel.reasonTermId })"
          novalidate
          @submit="saveBulkCancel"
        >
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="bulkCancel.reach?.refusal"
            color="error"
            icon="i-lucide-circle-x"
            :title="bulkCancel.reach.refusal.reason"
          >
            <template
              v-if="bulkCancel.reach.refusal.link"
              #description
            >
              <ULink :to="bulkCancel.reach.refusal.link">
                See what is holding it
              </ULink>
            </template>
          </UAlert>
          <ul
            v-if="bulkCancel.reach?.lines.length"
            class="list-disc space-y-1 ps-5 text-sm"
          >
            <li
              v-for="line in bulkCancel.reach.lines"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
          <UFormField
            name="reasonTermId"
            label="Reason"
            required
          >
            <USelect
              v-model="bulkCancel.reasonTermId"
              :items="reasons"
              placeholder="Choose a reason"
            />
          </UFormField>
          <UFormField
            label="Note"
            help="Kept with each performance, for the team."
          >
            <UTextarea
              v-model="bulkCancel.note"
              :rows="2"
              maxlength="200"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="chosenScheduled.length === 1 ? 'Keep the performance' : 'Keep the performances'"
            color="neutral"
            variant="outline"
            @click="bulkCancel.open = false"
          />
          <UButton
            type="submit"
            form="cancel-performances"
            :label="chosenScheduled.length === 1 ? 'Cancel performance' : `Cancel ${chosenScheduled.length} performances`"
            color="error"
            :loading="bulkBusy"
            :disabled="!!bulkCancel.reach?.refusal"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="accessOpen"
      title="Access at this performance"
      description="What this performance offers, such as captioning, with any detail."
    >
      <template #body>
        <UForm
          id="performance-access"
          class="space-y-3"
          :state="accessChosen"
          novalidate
          @submit="saveAccess"
        >
          <RefusalNotice :refusal="refusal" />
          <div
            v-for="a in shownAccess"
            :key="a.id"
            class="flex flex-wrap items-center gap-3"
          >
            <UCheckbox
              v-model="accessChosen[a.id]!.on"
              :label="a.label"
              class="w-56"
            />
            <UInput
              v-if="accessChosen[a.id]!.on"
              v-model="accessChosen[a.id]!.detail"
              placeholder="Detail, such as who provides it"
              :aria-label="`Detail for ${a.label}`"
              maxlength="200"
              size="sm"
              class="flex-1"
            />
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="performance-access"
          label="Save access"
        />
      </template>
    </UModal>
    <UModal
      v-model:open="effectsOpen"
      title="Staging effects at this performance"
      description="Tick any effect the production uses that this performance does not. The audience is told it is not used at this performance."
    >
      <template #body>
        <UForm
          id="performance-effects"
          class="space-y-3"
          :state="effectsOff"
          novalidate
          @submit="saveEffects"
        >
          <RefusalNotice :refusal="refusal" />
          <UCheckbox
            v-for="e in productionEffects"
            :key="e.id"
            v-model="effectsOff[e.id]"
            :label="`Not used: ${e.label}`"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="performance-effects"
          label="Save"
        />
      </template>
    </UModal>
    <PerformanceRunDialog
      v-if="data"
      v-model:open="addingRun"
      :production-id="productionId"
      :spaces="spaces"
      :presets="data.options.presets"
      :defaults="data.defaults"
      :defaults-in="defaultsIn"
      :suggested="suggestedRun"
      @added="added"
      @presets-changed="refresh()"
    />
    <PerformanceRunEditDialog
      v-model:open="editRunOpen"
      :production-id="productionId"
      :run="editingRun"
      :spaces="spaces"
      @changed="runEdited"
    />
  </PageSection>
</template>
