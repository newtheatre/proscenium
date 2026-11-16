<script setup lang="ts">
// A production's performances (C-03 to C-07, C-10): added as drafts, scheduled into a free space,
// changed, cancelled with a reason and reinstated. A change with a wide reach shows what it touches
// first, and a module that refuses it says why. Times are shown and entered in the theatre's time
// zone, whatever the viewer's.
type State = 'draft' | 'scheduled' | 'cancelled' | 'completed'
interface Performance {
  id: string
  venueId: string
  spaceId: string
  startsAt: number
  doorsAt: number | null
  endsAt: number
  intervalCount: number | null
  capacity: number | null
  label: string | null
  externalBookingUrl: string | null
  state: State
  cancelReasonTermId: string | null
  cancelNote: string | null
  access: { termId: string, detail: string | null }[]
}
interface Option { id: string, label: string, retired: boolean }
interface Answer {
  performances: Performance[]
  options: { venues: { id: string, name: string, spaces: { id: string, name: string, defaultCapacity: number | null }[] }[], access: Option[], reasons: Option[] }
}
type Kind = 'cancel' | 'reschedule' | 'move' | 'capacity'
interface Reach { lines: string[], refusal: { code: string, reason: string, link: string | null } | null }

const props = defineProps<{ productionId: string, title: string, intervalCount: number }>()
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<Answer>(() => `/api/core/productions/${props.productionId}/performances`, { key: `core:production:${props.productionId}:performances` })
const dates = useDates()
// Whole-day closures that block performances grey out their days in the date fields; the server still decides.
const { data: closures } = useAPI<{ rows: { venueId: string | null, spaceId: string | null, startsAt: number, endsAt: number, allDay: boolean, blocksPerformances: boolean }[] }>('/api/core/closures', { key: 'core:closures', lazy: true, server: false })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const TONES = { draft: 'neutral', scheduled: 'success', cancelled: 'danger', completed: 'info' } as const
const performances = computed(() => data.value?.performances ?? [])
const spaces = computed(() => (data.value?.options.venues ?? []).flatMap(v => v.spaces.map(s => ({ value: s.id, label: `${s.name}, ${v.name}`, venueId: v.id, capacity: s.defaultCapacity }))))
const place = (p: Performance) => spaces.value.find(s => s.value === p.spaceId)?.label ?? 'A space no longer listed'
/** Where, doors, end and seats, on one line. */
const summaryOf = (p: Performance) => [place(p), ...(p.doorsAt ? [`doors ${dates.time(p.doorsAt)}`] : []), `ends ${dates.time(p.endsAt)}`, ...(p.capacity !== null ? [`${p.capacity} seats`] : [])].join(' · ')
const accessLabel = (id: string) => data.value?.options.access.find(a => a.id === id)?.label ?? 'Access'
const thing = (p: Performance) => `the ${dates.time(p.startsAt)} performance of ${props.title} on ${dates.dayNamed(p.startsAt)}`

async function run(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
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
const intervalHelp = computed(() => `Left empty, the production's (${props.intervalCount}).`)
const open = ref(false)
const form = ref({ spaceId: '', startsAt: null as number | null, endsAt: null as number | null, doorsAt: null as number | null, capacity: null as number | null, intervalCount: null as number | null, label: '', externalBookingUrl: '' })
/** Whether a whole-day closure that blocks performances covers this day for the chosen space. */
function closed(day: string): boolean {
  const space = spaces.value.find(x => x.value === form.value.spaceId)
  return (closures.value?.rows ?? []).some(c => c.allDay && c.blocksPerformances
    && (!c.venueId || (c.venueId === space?.venueId && (!c.spaceId || c.spaceId === space.value)))
    && dates.toLocal(c.startsAt).slice(0, 10) <= day && day <= dates.toLocal(c.endsAt - 1).slice(0, 10)) // not-policy: the length of a date
}
function start(p: Performance | null) {
  refusal.value = null
  editing.value = p
  form.value = (p
    ? { spaceId: p.spaceId, startsAt: p.startsAt, endsAt: p.endsAt, doorsAt: p.doorsAt, capacity: p.capacity, intervalCount: p.intervalCount, label: p.label ?? '', externalBookingUrl: p.externalBookingUrl ?? '' }
    : { spaceId: spaces.value[0]?.value ?? '', startsAt: null, endsAt: null, doorsAt: null, capacity: null, intervalCount: null, label: '', externalBookingUrl: '' })
  open.value = true
}
async function save() {
  const space = spaces.value.find(s => s.value === form.value.spaceId)
  if (!space) return
  const body: Record<string, unknown> = {
    venueId: space.venueId,
    spaceId: space.value,
    startsAt: form.value.startsAt,
    capacity: form.value.capacity,
    intervalCount: form.value.intervalCount,
    label: form.value.label,
    externalBookingUrl: form.value.externalBookingUrl.trim() || null,
  }
  const p = editing.value
  if (!p) {
    // Left empty, the end and doors come from the running time and the theatre's settings.
    if (form.value.endsAt) body.endsAt = form.value.endsAt
    if (form.value.doorsAt) body.doorsAt = form.value.doorsAt
    if (await run(() => $api<unknown>(`/api/core/productions/${props.productionId}/performances` as string, { method: 'POST', body }), 'Performance added')) open.value = false
    return
  }
  body.endsAt = form.value.endsAt ?? p.endsAt
  body.doorsAt = form.value.doorsAt
  if (p.state === 'scheduled') {
    const kinds: Kind[] = []
    if (form.value.startsAt !== p.startsAt || body.endsAt !== p.endsAt) kinds.push('reschedule')
    if (form.value.spaceId !== p.spaceId) kinds.push('move')
    if (form.value.capacity !== p.capacity) kinds.push('capacity')
    const reached = await Promise.all(kinds.map(k => reach(p.id, k)))
    const refused = reached.find(r => r.refusal)?.refusal
    if (refused) {
      refusal.value = { code: refused.code, reason: refused.reason, remedy: refused.link ?? undefined } as ReturnType<typeof toRefusal>
      return
    }
    const lines = reached.flatMap(r => r.lines)
    if (lines.length && !await confirm({ verb: 'Change', thing: thing(p), consequence: lines.join(' '), button: 'Change performance' })) return
  }
  if (await run(() => call(p.id, '', 'PATCH', body), 'Performance saved')) open.value = false
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

function actions(p: Performance) {
  const items = []
  if (p.state === 'draft') items.push({ label: 'Schedule', icon: 'i-lucide-calendar-check', onSelect: () => schedule(p) })
  if (p.state === 'draft' || p.state === 'scheduled') {
    items.push({ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => start(p) })
    items.push({ label: 'Access', icon: 'i-lucide-accessibility', onSelect: () => startAccess(p) })
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
    description="Each starts as a draft and is public once scheduled."
  >
    <template #actions>
      <UButton
        label="Add performance"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="!spaces.length"
        @click="start(null)"
      />
    </template>
    <p
      v-if="data && !spaces.length"
      class="text-sm text-muted"
    >
      Add a venue with a space that can hold performances first.
    </p>
    <RefusalNotice
      v-if="!open && !cancelling && !accessFor"
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
      <RecordList
        v-else
        label="Performances"
      >
        <RecordListItem
          v-for="p in performances"
          :key="p.id"
          :description="summaryOf(p)"
        >
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
            :label="p.state.charAt(0).toUpperCase() + p.state.slice(1)"
          />
          <UDropdownMenu
            v-if="actions(p).length"
            :items="actions(p)"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              :aria-label="`Actions for ${dates.dateTime(p.startsAt)}`"
            />
          </UDropdownMenu>
        </RecordListItem>
      </RecordList>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="editing ? 'Edit performance' : 'Add performance'"
      :description="editing?.state === 'scheduled' ? 'It is scheduled, so a new time or space must be free.' : 'It starts as a draft. Nothing is public until it is scheduled.'"
    >
      <template #body>
        <UForm
          id="performance-form"
          class="space-y-4"
          :state="form"
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Space"
            required
          >
            <USelect
              v-model="form.spaceId"
              :items="spaces"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Starts"
              required
            >
              <FieldDateTime
                v-model="form.startsAt"
                :unavailable="closed"
              />
            </UFormField>
            <UFormField
              label="Ends"
              :help="editing ? undefined : 'Left empty, from the running time.'"
            >
              <FieldDateTime
                v-model="form.endsAt"
                :unavailable="closed"
              />
            </UFormField>
            <UFormField
              label="Doors open"
              :help="editing ? 'Moves with the start unless you change it.' : 'Left empty, from the doors setting.'"
            >
              <FieldDateTime
                v-model="form.doorsAt"
                :unavailable="closed"
              />
            </UFormField>
            <UFormField
              label="Capacity"
              help="Left empty, the space's own."
            >
              <UInputNumber
                v-model="form.capacity"
                :min="0"
              />
            </UFormField>
            <UFormField
              label="Intervals"
              :help="intervalHelp"
            >
              <UInputNumber
                v-model="form.intervalCount"
                :min="0"
                :max="10"
              />
            </UFormField>
            <UFormField
              label="Label"
              help="Such as Relaxed or Press night."
            >
              <UInput
                v-model="form.label"
                maxlength="40"
              />
            </UFormField>
          </div>
          <UFormField
            label="Booking link"
            help="Only when this performance is sold elsewhere. Must start https://."
          >
            <UInput
              v-model="form.externalBookingUrl"
              type="url"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="performance-form"
          :label="editing ? 'Save performance' : 'Add performance'"
          :disabled="!form.spaceId || !form.startsAt"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="cancelOpen"
      title="Cancel performance"
      :description="cancelling ? `Cancel ${thing(cancelling)}?` : undefined"
    >
      <template #body>
        <UForm
          id="cancel-performance"
          class="space-y-4"
          :state="cancelForm"
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
        <UButton
          type="submit"
          form="cancel-performance"
          label="Cancel performance"
          color="error"
          :disabled="!cancelForm.reasonTermId || !!cancelReach?.refusal"
        />
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
  </PageSection>
</template>
