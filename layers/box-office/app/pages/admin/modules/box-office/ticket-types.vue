<!-- Ticket types (Box office specification, part 6): the kinds of ticket the theatre sells, such as
     Full price and Concession, shared by every production and listed in the order set here. A type
     a module keeps (Companion, Complimentary, Member) shows which module, and only its name, order
     and whether it is sold can be changed; its rules are the module's. The order is set by dragging a
     row's handle, or from the keyboard with the arrow keys on the handle or Move up and Move down. A type a person made may ask
     for requirements, such as a membership, chosen from what the switched-on modules provide. Any
     type can be sold everywhere, only at the box office (an industry rate, a price on the door) or
     only online. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

type Kind = 'standard' | 'concession' | 'companion' | 'complimentary'
type Channel = 'all' | 'desk' | 'online'
interface TicketType {
  id: string
  name: string
  kind: Kind
  requirementRefs: string[]
  maxPerHolder: number
  recheckAtEntry: boolean
  proofNote: string | null
  needsPaidTicket: boolean
  active: boolean
  channel: Channel
  sort: number
  managedBy: string | null
  available: boolean
  used: boolean
}
interface Listing { ticketTypes: TicketType[], requirementOptions: { value: string, label: string }[], requirementLabels: Record<string, string> }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const { data, status, error, refresh } = await useAPI<Listing>('/api/box-office/ticket-types', { key: 'box-office:ticket-types' })

const kinds = computed(() => (['standard', 'concession'] as const).map(value => ({ value, label: t(`box-office.ticket-types.kind.${value}`) })))
const channels = computed(() => (['all', 'desk', 'online'] as const).map(value => ({ value, label: t(`box-office.ticket-types.channel.${value}`) })))
const options = computed(() => data.value?.requirementOptions ?? [])
// A fact's label arrives as its translation key.
const labelOf = (ref: string) => {
  const label = data.value?.requirementLabels[ref] ?? ref
  return te(label) ? t(label) : label
}
// `box-office.companion` is kept by box-office: the module's own name for it.
const moduleName = (managedBy: string) => t(`${managedBy.slice(0, managedBy.lastIndexOf('.'))}.module.name`)

interface FormState { name: string, kind: 'standard' | 'concession', channel: Channel, proofNote: string, requirementRefs: string[], maxPerHolder: number, active: boolean }
const blank = (): FormState => ({ name: '', kind: 'standard', channel: 'all', proofNote: '', requirementRefs: [], maxPerHolder: 1, active: true })
const form = ref<FormState>(blank())
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

function body(f: FormState, managed: boolean) {
  const common = { name: f.name.trim(), channel: f.channel, proofNote: f.proofNote.trim() || null }
  if (managed) return common
  return { ...common, kind: f.kind, requirementRefs: f.requirementRefs, ...(f.requirementRefs.length ? { maxPerHolder: f.maxPerHolder } : {}) }
}

const url = (id: string) => `/api/box-office/ticket-types/${encodeURIComponent(id)}`
const patch = (id: string, b: Record<string, unknown>) => $api(url(id), { method: 'PATCH', body: b })
const create = (b: Record<string, unknown>) => $api<{ ticketTypeId: string }>('/api/box-office/ticket-types', { method: 'POST', body: b })
// The form as it stood for a type, so a change can be put back.
const asForm = (type: TicketType): FormState => ({ name: type.name, kind: type.kind === 'concession' ? 'concession' : 'standard', channel: type.channel, proofNote: type.proofNote ?? '', requirementRefs: [...type.requirementRefs], maxPerHolder: type.maxPerHolder, active: type.active })

// Does the act, then says so with an Undo that does its reverse.
async function run<T>(fn: () => Promise<T>, done: string, undo?: (result: T) => Promise<unknown>, onRefusal = refusal) {
  onRefusal.value = null
  try {
    const result = await fn()
    await refresh()
    offer(done, undo && (async () => {
      await undo(result)
      await refresh()
    }))
    return true
  }
  catch (e) {
    onRefusal.value = toRefusal(e)
    return false
  }
}

async function add() {
  const name = form.value.name.trim()
  if (await run(() => create(body(form.value, false)), t('box-office.ticket-types.added', { name }), ({ ticketTypeId }) => $api(url(ticketTypeId), { method: 'DELETE' }))) form.value = blank()
}

// Editing one type, in a dialog.
const editing = ref<TicketType | null>(null)
const editForm = ref<FormState>(blank())
const editRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const editOpen = computed({ get: () => !!editing.value, set: (v) => { if (!v) editing.value = null } })

function startEdit(type: TicketType) {
  editRefusal.value = null
  editForm.value = asForm(type)
  editing.value = type
}

async function save() {
  const type = editing.value
  if (!type) return
  const managed = !!type.managedBy
  const before = body(asForm(type), managed)
  if (await run(() => patch(type.id, body(editForm.value, managed)), t('box-office.ticket-types.saved', { name: editForm.value.name.trim() }), () => patch(type.id, before), editRefusal)) editing.value = null
}

async function setActive(type: TicketType, active: boolean) {
  await run(() => patch(type.id, { active }), t(active ? 'box-office.ticket-types.restored' : 'box-office.ticket-types.retired', { name: type.name }), () => patch(type.id, { active: !active }))
}

async function remove(type: TicketType) {
  if (!await confirm({ verb: t('box-office.ticket-types.delete.verb'), thing: type.name, consequence: t('box-office.ticket-types.delete.consequence') })) return
  // Only a type nothing has used can be deleted, so undoing it makes the same type again, in its old place.
  await run(() => $api(url(type.id), { method: 'DELETE' }), t('box-office.ticket-types.deleted', { name: type.name }), async () => {
    const { ticketTypeId } = await create({ ...body(asForm(type), false), recheckAtEntry: type.recheckAtEntry, sort: type.sort })
    if (!type.active) await patch(ticketTypeId, { active: false })
  })
}

// The order, as shown: dragged rows move here first and are then saved as a whole. Retired types
// fold away under a divider below and keep their places after the others.
const ordered = ref<TicketType[]>([])
const retired = computed(() => (data.value?.ticketTypes ?? []).filter(x => !x.active))
// Orders being saved. While one is, the list on screen is newer than anything loaded: a load that
// was answered before the latest save (such as the one after the save before it) would put rows
// back where they were. The list is loaded again once the last save is done.
let saving = 0
watch(() => data.value?.ticketTypes, (types) => {
  if (!saving) ordered.value = (types ?? []).filter(x => x.active)
}, { immediate: true })
const showRetired = ref(false)

// A search that opens from its icon. Rows that do not match are hidden rather than left out, so
// dragging still counts every row.
const search = ref('')
const words = computed(() => search.value.trim().toLowerCase())
const matches = (type: TicketType) => !words.value || type.name.toLowerCase().includes(words.value)
const matchingRetired = computed(() => retired.value.filter(matches))
const noMatch = computed(() => !!words.value && !ordered.value.some(matches) && !matchingRetired.value.length)
watch(words, (w) => { if (w && matchingRetired.value.length) showRetired.value = true })
const moved = ref('')

async function saveOrder(type: TicketType) {
  const at = ordered.value.findIndex(x => x.id === type.id)
  moved.value = t('box-office.ticket-types.order.moved', { name: type.name, position: at + 1, count: ordered.value.length })
  refusal.value = null
  saving++
  try {
    await $api('/api/box-office/ticket-types/order', { method: 'PUT', body: { ticketTypeIds: [...ordered.value, ...retired.value].map(x => x.id) } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving--
  }
  // Only the last save loads the list again, after every order sent so far is stored. A refused
  // one draws the stored order back.
  if (saving) return
  await refresh()
  if (!saving) ordered.value = (data.value?.ticketTypes ?? []).filter(x => x.active)
}

// The SortableList says what was dragged; the order is drawn from `ordered`, so it is set here.
function onReorder({ id, from, to }: { id: string, from: number, to: number }) {
  const next = [...ordered.value]
  const [type] = next.splice(from, 1)
  if (!type || type.id !== id) return
  next.splice(to, 0, type)
  ordered.value = next
  saveOrder(type)
}

function move(type: TicketType, by: -1 | 1): Promise<void> {
  const from = ordered.value.findIndex(x => x.id === type.id)
  const to = from + by
  if (from < 0 || to < 0 || to >= ordered.value.length) return Promise.resolve()
  const next = [...ordered.value]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  ordered.value = next
  return saveOrder(type)
}

async function onHandleKey(event: KeyboardEvent, type: TicketType) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  // The row is drawn again in its new place, and again once the saved order comes back: keep the
  // keyboard on its handle both times.
  const keepFocus = () => document.querySelector<HTMLElement>(`[data-drag-handle="${type.id}"]`)?.focus()
  const saving = move(type, by)
  await nextTick()
  keepFocus()
  await saving
  await nextTick()
  keepFocus()
}

function actions(type: TicketType): DropdownMenuItem[] {
  const at = ordered.value.findIndex(x => x.id === type.id)
  const items: DropdownMenuItem[] = [{ label: t('box-office.ticket-types.edit'), icon: 'i-lucide-pencil', onSelect: () => startEdit(type) }]
  if (type.active) {
    items.push(
      { label: t('box-office.ticket-types.order.up'), icon: 'i-lucide-arrow-up', disabled: at <= 0, onSelect: () => move(type, -1) },
      { label: t('box-office.ticket-types.order.down'), icon: 'i-lucide-arrow-down', disabled: at >= ordered.value.length - 1, onSelect: () => move(type, 1) },
    )
  }
  items.push(type.active
    ? { label: t('box-office.ticket-types.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(type, false) }
    : { label: t('box-office.ticket-types.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(type, true) })
  if (!type.managedBy && !type.used) items.push({ label: t('box-office.ticket-types.delete.button'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(type) })
  return items
}

function describe(type: TicketType): string {
  const parts: string[] = [t(`box-office.ticket-types.kind.${type.kind}`)]
  if (type.requirementRefs.length) parts.push(t('box-office.ticket-types.for', { who: type.requirementRefs.map(labelOf).join(t('box-office.ticket-types.or')) }))
  if (type.channel !== 'all') parts.push(t(`box-office.ticket-types.channel.note.${type.channel}`))
  if (type.proofNote) parts.push(type.proofNote)
  if (type.managedBy) parts.push(t('box-office.ticket-types.kept-by', { module: moduleName(type.managedBy) }))
  if (!type.available) parts.push(t('box-office.ticket-types.module-off'))
  return parts.join(' · ')
}
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.ticket-types.label')"
    :description="t('box-office.ticket-types.description')"
  >
    <template #primary>
      <SearchToggle
        v-if="(data?.ticketTypes.length ?? 0) > 1"
        v-model="search"
        :label="t('box-office.ticket-types.search')"
      />
    </template>
    <div class="space-y-8">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <EmptyState
            v-if="!d.ticketTypes.length"
            :title="t('box-office.ticket-types.empty.title')"
            :description="t('box-office.ticket-types.empty.description')"
            icon="i-lucide-tags"
          />
          <p
            v-if="ordered.length > 1"
            class="mb-2 text-sm text-muted"
          >
            {{ t('box-office.ticket-types.order.help') }}
          </p>
          <p
            v-if="noMatch"
            class="mb-2 text-sm text-muted"
          >
            {{ t('box-office.ticket-types.no-match', { words: search.trim() }) }}
          </p>
          <SortableList
            v-if="ordered.length"
            :label="t('box-office.navigation.ticket-types.label')"
            @reorder="onReorder"
          >
            <SortableRow
              v-for="(type, position) in ordered"
              v-show="matches(type)"
              :id="type.id"
              :key="type.id"
              :index="position"
              :name="type.name"
              :description="describe(type)"
              :icon="type.managedBy ? 'i-lucide-lock' : undefined"
              :muted="!type.active || !type.available"
            >
              <template #leading>
                <IconButton
                  :data-drag-handle="type.id"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="t('box-office.ticket-types.order.handle', { name: type.name })"
                  aria-describedby="ticket-types-order-help"
                  @keydown="onHandleKey($event, type)"
                />
              </template>
              <RowActions
                :items="actions(type)"
                :label="t('box-office.ticket-types.actions', { name: type.name })"
              />
            </SortableRow>
          </SortableList>
          <CollapsibleDivider
            v-model:open="showRetired"
            class="mt-4"
            :label="t('box-office.ticket-types.retired-note')"
            :count="matchingRetired.length"
          >
            <RecordList :label="t('box-office.ticket-types.retired-note')">
              <RecordListItem
                v-for="type in matchingRetired"
                :key="type.id"
                :name="type.name"
                :description="describe(type)"
                :icon="type.managedBy ? 'i-lucide-lock' : undefined"
              >
                <RowActions
                  :items="actions(type)"
                  :label="t('box-office.ticket-types.actions', { name: type.name })"
                />
              </RecordListItem>
            </RecordList>
          </CollapsibleDivider>
          <span
            id="ticket-types-order-help"
            class="sr-only"
          >{{ t('box-office.ticket-types.order.keys') }}</span>
          <span
            class="sr-only"
            aria-live="polite"
          >{{ moved }}</span>
        </template>
      </DataBoundary>

      <PageSection :title="t('box-office.ticket-types.add.title')">
        <UForm
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="add"
        >
          <UFormField
            name="name"
            :label="t('box-office.ticket-types.add.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField :label="t('box-office.ticket-types.add.kind')">
            <USelect
              v-model="form.kind"
              :items="kinds"
            />
          </UFormField>
          <UFormField :label="t('box-office.ticket-types.channel.label')">
            <USelect
              v-model="form.channel"
              :items="channels"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.ticket-types.add.proof')"
            :help="t('box-office.ticket-types.add.proof-help')"
          >
            <UInput
              v-model="form.proofNote"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            v-if="options.length"
            :label="t('box-office.ticket-types.add.requirements')"
            :help="t('box-office.ticket-types.add.requirements-help')"
          >
            <UCheckboxGroup
              v-model="form.requirementRefs"
              :items="options"
            />
          </UFormField>
          <UFormField
            v-if="form.requirementRefs.length"
            :label="t('box-office.ticket-types.add.max-per-holder')"
            :help="t('box-office.ticket-types.add.max-per-holder-help')"
          >
            <UInputNumber
              v-model="form.maxPerHolder"
              :min="1"
              :max="50"
            />
          </UFormField>
          <UButton
            type="submit"
            :label="t('box-office.ticket-types.add.button')"
          />
        </UForm>
      </PageSection>
    </div>

    <UModal
      v-model:open="editOpen"
      :title="t('box-office.ticket-types.edit-title', { name: editing?.name ?? '' })"
      :description="editing?.managedBy ? t('box-office.ticket-types.managed-help', { module: moduleName(editing.managedBy) }) : undefined"
    >
      <template #body>
        <UForm
          id="box-office-ticket-type"
          class="space-y-4"
          :state="editForm"
          :validate="() => needs({ name: editForm.name })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="editRefusal" />
          <UFormField
            name="name"
            :label="t('box-office.ticket-types.add.name')"
            required
          >
            <UInput
              v-model="editForm.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField
            v-if="!editing?.managedBy"
            :label="t('box-office.ticket-types.add.kind')"
          >
            <USelect
              v-model="editForm.kind"
              :items="kinds"
            />
          </UFormField>
          <UFormField :label="t('box-office.ticket-types.channel.label')">
            <USelect
              v-model="editForm.channel"
              :items="channels"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.ticket-types.add.proof')"
            :help="t('box-office.ticket-types.add.proof-help')"
          >
            <UInput
              v-model="editForm.proofNote"
              maxlength="120"
            />
          </UFormField>
          <template v-if="!editing?.managedBy">
            <UFormField
              v-if="options.length"
              :label="t('box-office.ticket-types.add.requirements')"
              :help="t('box-office.ticket-types.add.requirements-help')"
            >
              <UCheckboxGroup
                v-model="editForm.requirementRefs"
                :items="options"
              />
            </UFormField>
            <UFormField
              v-if="editForm.requirementRefs.length"
              :label="t('box-office.ticket-types.add.max-per-holder')"
              :help="t('box-office.ticket-types.add.max-per-holder-help')"
            >
              <UInputNumber
                v-model="editForm.maxPerHolder"
                :min="1"
                :max="50"
              />
            </UFormField>
          </template>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="box-office-ticket-type"
          :label="t('box-office.ticket-types.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
