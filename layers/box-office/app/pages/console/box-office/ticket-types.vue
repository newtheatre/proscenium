<!-- Ticket types (Box office specification, part 6): the kinds of ticket the theatre sells, such as
     Full price and Concession, shared by every production and listed in the order set here. A type
     a module keeps (Companion, Complimentary, Member) shows which module, and only its name, order
     and whether it is sold can be changed; its rules are the module's. A type a person made may ask
     for requirements, such as a membership, chosen from what the switched-on modules provide. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'console' })

type Kind = 'standard' | 'concession' | 'companion' | 'complimentary'
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
const options = computed(() => data.value?.requirementOptions ?? [])
const labelOf = (ref: string) => data.value?.requirementLabels[ref] ?? ref
// `box-office.companion` is kept by box-office: the module's own name for it.
const moduleName = (managedBy: string) => t(`${managedBy.slice(0, managedBy.lastIndexOf('.'))}.module.name`)

interface FormState { name: string, kind: 'standard' | 'concession', proofNote: string, requirementRefs: string[], maxPerHolder: number, sort: number, active: boolean }
const blank = (): FormState => ({ name: '', kind: 'standard', proofNote: '', requirementRefs: [], maxPerHolder: 1, sort: 0, active: true })
const form = ref<FormState>(blank())
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

function body(f: FormState, managed: boolean) {
  const common = { name: f.name.trim(), proofNote: f.proofNote.trim() || null, sort: f.sort }
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
  editForm.value = { name: type.name, kind: type.kind === 'concession' ? 'concession' : 'standard', proofNote: type.proofNote ?? '', requirementRefs: [...type.requirementRefs], maxPerHolder: type.maxPerHolder, sort: type.sort, active: type.active }
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

function actions(type: TicketType): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [{ label: t('box-office.ticket-types.edit'), icon: 'i-lucide-pencil', onSelect: () => startEdit(type) }]
  items.push(type.active
    ? { label: t('box-office.ticket-types.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(type, false) }
    : { label: t('box-office.ticket-types.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(type, true) })
  if (!type.managedBy && !type.used) items.push({ label: t('box-office.ticket-types.delete.button'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(type) })
  return items
}

function describe(type: TicketType): string {
  const parts: string[] = [t(`box-office.ticket-types.kind.${type.kind}`)]
  if (type.requirementRefs.length) parts.push(t('box-office.ticket-types.for', { who: type.requirementRefs.map(labelOf).join(t('box-office.ticket-types.or')) }))
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
          <RecordList
            v-else
            :label="t('box-office.navigation.ticket-types.label')"
          >
            <RecordListItem
              v-for="type in d.ticketTypes"
              :key="type.id"
              :name="type.name"
              :description="describe(type)"
              :icon="type.managedBy ? 'i-lucide-lock' : undefined"
              :muted="!type.active || !type.available"
            >
              <RowActions
                :items="actions(type)"
                :label="t('box-office.ticket-types.actions', { name: type.name })"
              />
            </RecordListItem>
          </RecordList>
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
          <UFormField
            :label="t('box-office.ticket-types.add.sort')"
            :help="t('box-office.ticket-types.add.sort-help')"
          >
            <UInputNumber
              v-model="form.sort"
              :min="0"
              :max="999"
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
          <UFormField
            :label="t('box-office.ticket-types.add.sort')"
            :help="t('box-office.ticket-types.add.sort-help')"
          >
            <UInputNumber
              v-model="editForm.sort"
              :min="0"
              :max="999"
            />
          </UFormField>
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
