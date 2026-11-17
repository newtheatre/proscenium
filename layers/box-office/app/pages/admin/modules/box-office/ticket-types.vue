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
import { unrefElement } from '@vueuse/core'
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable'

definePageMeta({ layout: 'console' })

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

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Listing>('/api/box-office/ticket-types', { key: 'box-office:ticket-types' })

const kinds = computed(() => (['standard', 'concession'] as const).map(value => ({ value, label: t(`box-office.ticket-types.kind.${value}`) })))
const channels = computed(() => (['all', 'desk', 'online'] as const).map(value => ({ value, label: t(`box-office.ticket-types.channel.${value}`) })))
const options = computed(() => data.value?.requirementOptions ?? [])
const labelOf = (ref: string) => data.value?.requirementLabels[ref] ?? ref
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

async function add() {
  refusal.value = null
  try {
    await $api('/api/box-office/ticket-types', { method: 'POST', body: body(form.value, false) })
    toast.add({ title: t('box-office.ticket-types.added', { name: form.value.name.trim() }), color: 'success' })
    form.value = blank()
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Editing one type, in a dialog.
const editing = ref<TicketType | null>(null)
const editForm = ref<FormState>(blank())
const editRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const editOpen = computed({ get: () => !!editing.value, set: (v) => { if (!v) editing.value = null } })

function startEdit(type: TicketType) {
  editRefusal.value = null
  editForm.value = { name: type.name, kind: type.kind === 'concession' ? 'concession' : 'standard', channel: type.channel, proofNote: type.proofNote ?? '', requirementRefs: [...type.requirementRefs], maxPerHolder: type.maxPerHolder, active: type.active }
  editing.value = type
}

async function save() {
  const type = editing.value
  if (!type) return
  editRefusal.value = null
  try {
    await $api(`/api/box-office/ticket-types/${encodeURIComponent(type.id)}`, { method: 'PATCH', body: body(editForm.value, !!type.managedBy) })
    toast.add({ title: t('box-office.ticket-types.saved', { name: editForm.value.name.trim() }), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    editRefusal.value = toRefusal(e)
  }
}

async function setActive(type: TicketType, active: boolean) {
  refusal.value = null
  try {
    await $api(`/api/box-office/ticket-types/${encodeURIComponent(type.id)}`, { method: 'PATCH', body: { active } })
    toast.add({ title: t(active ? 'box-office.ticket-types.restored' : 'box-office.ticket-types.retired', { name: type.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function remove(type: TicketType) {
  if (!await confirm({ verb: t('box-office.ticket-types.delete.verb'), thing: type.name, consequence: t('box-office.ticket-types.delete.consequence') })) return
  refusal.value = null
  try {
    await $api(`/api/box-office/ticket-types/${encodeURIComponent(type.id)}`, { method: 'DELETE' })
    toast.add({ title: t('box-office.ticket-types.deleted', { name: type.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// The order, as shown: dragged rows move here first and are then saved as a whole.
const ordered = ref<TicketType[]>([])
watch(() => data.value?.ticketTypes, (types) => { ordered.value = [...(types ?? [])] }, { immediate: true })
// The RecordList component; Sortable works on its <ul>.
const list = useTemplateRef('list')
const moved = ref('')

async function saveOrder(type: TicketType) {
  const at = ordered.value.findIndex(x => x.id === type.id)
  moved.value = t('box-office.ticket-types.order.moved', { name: type.name, position: at + 1, count: ordered.value.length })
  refusal.value = null
  try {
    await $api('/api/box-office/ticket-types/order', { method: 'PUT', body: { ticketTypeIds: ordered.value.map(x => x.id) } })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    await refresh()
    ordered.value = [...(data.value?.ticketTypes ?? [])]
  }
}

useSortable(list, ordered, {
  watchElement: true,
  handle: '[data-drag-handle]',
  animation: 150,
  onUpdate: (e: { item: HTMLElement, from: HTMLElement, oldIndex?: number, newIndex?: number }) => {
    if (e.oldIndex === undefined || e.newIndex === undefined || e.oldIndex === e.newIndex) return
    // Sortable has already moved the row; put it back so Vue draws the new order itself.
    removeNode(e.item)
    insertNodeAt(e.from, e.item, e.oldIndex)
    const next = [...ordered.value]
    const [type] = next.splice(e.oldIndex, 1)
    next.splice(e.newIndex, 0, type!)
    ordered.value = next
    saveOrder(type!)
  },
})

function move(type: TicketType, by: -1 | 1) {
  const from = ordered.value.findIndex(x => x.id === type.id)
  const to = from + by
  if (from < 0 || to < 0 || to >= ordered.value.length) return
  const next = [...ordered.value]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  ordered.value = next
  saveOrder(type)
}

async function onHandleKey(event: KeyboardEvent, type: TicketType) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  move(type, by)
  // The row is drawn again in its new place: keep the keyboard on its handle.
  await nextTick()
  const ul = unrefElement(list) as HTMLElement | undefined
  ul?.querySelector<HTMLElement>(`[data-drag-handle="${type.id}"]`)?.focus()
}

function actions(type: TicketType): DropdownMenuItem[] {
  const at = ordered.value.findIndex(x => x.id === type.id)
  const items: DropdownMenuItem[] = [
    { label: t('box-office.ticket-types.edit'), icon: 'i-lucide-pencil', onSelect: () => startEdit(type) },
    { label: t('box-office.ticket-types.order.up'), icon: 'i-lucide-arrow-up', disabled: at <= 0, onSelect: () => move(type, -1) },
    { label: t('box-office.ticket-types.order.down'), icon: 'i-lucide-arrow-down', disabled: at >= ordered.value.length - 1, onSelect: () => move(type, 1) },
  ]
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
  else if (!type.active) parts.push(t('box-office.ticket-types.retired-note'))
  return parts.join(' · ')
}
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.ticket-types.label')"
    :description="t('box-office.ticket-types.description')"
  >
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
            v-if="d.ticketTypes.length > 1"
            class="mb-2 text-sm text-muted"
          >
            {{ t('box-office.ticket-types.order.help') }}
          </p>
          <RecordList
            v-if="d.ticketTypes.length"
            ref="list"
            :label="t('box-office.navigation.ticket-types.label')"
          >
            <RecordListItem
              v-for="type in ordered"
              :key="type.id"
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
            </RecordListItem>
          </RecordList>
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
          @submit="add"
        >
          <UFormField
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
            :disabled="!form.name.trim()"
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
          @submit="save"
        >
          <RefusalNotice :refusal="editRefusal" />
          <UFormField
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
          :disabled="!editForm.name.trim()"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
