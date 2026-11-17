<!-- Ticket presets (show walkthrough, decisions 2 and 8): the tickets a new show starts from, as run
     presets are the start times a new run starts from. The theatre has a usual preset and a space may
     have its own. Changing a preset does not change a show already set up. -->
<script setup lang="ts">
import type { GridSection, GridType } from '../../../../components/BoxOfficeTicketGrid.vue'

interface PresetSection { name: string | null, seats: number | null, prices: { ticketTypeId: string, amountMinor: number }[] }
interface Preset { id: string, name: string, sections: PresetSection[], spaceIds: string[] }
interface Listing { rows: Preset[], usual: string | null, spaces: { id: string, name: string }[] }
interface TicketType { id: string, name: string, kind: string, active: boolean, available: boolean, managedBy: string | null, proofNote: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const { money } = await useMoney()
const { data, status, error, refresh } = await useAPI<Listing>('/api/box-office/ticket-presets', { key: 'box-office:ticket-presets' })
const { data: typeList } = await useAPI<{ ticketTypes: TicketType[] }>('/api/box-office/ticket-types', { key: 'box-office:ticket-types' })

/** The types a preset can price: sold, and not given only by approving a request or priced by Box office itself. */
const types = computed<GridType[]>(() => (typeList.value?.ticketTypes ?? [])
  .filter(type => type.active && type.available && type.kind !== 'complimentary' && type.managedBy !== 'box-office.wheelchair')
  .map(type => ({ id: type.id, name: type.name, hint: type.proofNote })))
const typeName = (id: string) => typeList.value?.ticketTypes.find(type => type.id === id)?.name ?? '?'

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
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

// A preset in words: "Full price £12 · Concession £8", or each section's prices with its name.
function pricesInWords(prices: PresetSection['prices']) {
  return prices.length ? prices.map(p => `${typeName(p.ticketTypeId)} ${money(p.amountMinor)}`).join(' · ') : t('box-office.presets.unpriced')
}
function describe(p: Preset) {
  const prices = p.sections.length === 1 ? pricesInWords(p.sections[0]!.prices) : p.sections.map(s => `${s.name}: ${pricesInWords(s.prices)}`).join('; ')
  const spaces = p.spaceIds.map(id => data.value?.spaces.find(s => s.id === id)?.name).filter(Boolean)
  return [prices, ...(spaces.length ? [t('box-office.presets.usual-in', { spaces: spaces.join(', ') })] : [])].join(' · ')
}

// Editing, in a dialog.
const editing = ref(false)
const editId = ref<string | null>(null)
const formRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ name: '', sections: [] as GridSection[], spaceIds: [] as string[] })
const asGrid = (sections: PresetSection[]): GridSection[] => sections.map((s, i) => ({ key: `s${i}`, name: s.name ?? '', seats: s.seats, prices: Object.fromEntries(s.prices.map(p => [p.ticketTypeId, p.amountMinor])) }))
const asBody = (p: { name: string, sections: GridSection[], spaceIds: string[] }) => ({
  name: p.name.trim(),
  sections: p.sections.map(s => ({
    name: p.sections.length > 1 ? s.name.trim() : (s.name.trim() || null),
    seats: p.sections.length > 1 ? s.seats : null,
    prices: Object.entries(s.prices).filter((e): e is [string, number] => e[1] !== null && e[1] !== undefined).map(([ticketTypeId, amountMinor]) => ({ ticketTypeId, amountMinor })),
  })),
  spaceIds: p.spaceIds,
})
const fromPreset = (p: Preset) => asBody({ name: p.name, sections: asGrid(p.sections), spaceIds: p.spaceIds })

function open(p?: Preset) {
  editId.value = p?.id ?? null
  form.name = p?.name ?? ''
  form.sections = p ? asGrid(p.sections) : [{ key: 's0', name: '', seats: null, prices: {} }]
  form.spaceIds = p ? [...p.spaceIds] : []
  formRefusal.value = null
  editing.value = true
}
const url = (id: string) => `/api/box-office/ticket-presets/${encodeURIComponent(id)}`
async function save() {
  const body = asBody(form)
  const id = editId.value
  const before = id ? data.value?.rows.find(p => p.id === id) : undefined
  const ok = id && before
    ? await run(() => $api(url(id), { method: 'PUT', body }), t('box-office.presets.saved', { name: body.name }), () => $api(url(id), { method: 'PUT', body: fromPreset(before) }), formRefusal)
    : await run(() => $api<{ id: string }>('/api/box-office/ticket-presets', { method: 'POST', body }), t('box-office.presets.added', { name: body.name }), made => $api(url(made.id), { method: 'DELETE' }), formRefusal)
  if (ok) editing.value = false
}
async function remove(p: Preset) {
  if (!await confirm({ verb: t('box-office.presets.delete.verb'), thing: p.name, consequence: t('box-office.presets.delete.consequence') })) return
  const wasUsual = data.value?.usual === p.id
  await run(() => $api(url(p.id), { method: 'DELETE' }), t('box-office.presets.deleted', { name: p.name }), async () => {
    const made = await $api<{ id: string }>('/api/box-office/ticket-presets', { method: 'POST', body: fromPreset(p) })
    if (wasUsual) await setUsual(made.id)
  })
}
const setUsual = (id: string | null) => $api('/api/core/settings/box-office.presets.usual', { method: 'PUT', body: id ? { value: id } : { reset: true } })
async function makeUsual(p: Preset) {
  const before = data.value?.usual ?? null
  await run(() => setUsual(p.id), t('box-office.presets.made-usual', { name: p.name }), () => setUsual(before))
}
const actions = (p: Preset) => [[
  { label: t('box-office.presets.edit'), icon: 'i-lucide-pencil', onSelect: () => open(p) },
  ...(data.value?.usual === p.id ? [] : [{ label: t('box-office.presets.make-usual'), icon: 'i-lucide-star', onSelect: () => makeUsual(p) }]),
  { label: t('box-office.presets.delete.verb'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(p) },
]]
const spaceItems = computed(() => (data.value?.spaces ?? []).map(s => ({ value: s.id, label: s.name })))
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.ticket-presets.label')"
    :description="t('box-office.presets.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('box-office.presets.new')"
        icon="i-lucide-plus"
        @click="open()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-4">
          <RefusalNotice
            v-if="!editing"
            :refusal="refusal"
          />
          <EmptyState
            v-if="!d.rows.length"
            :title="t('box-office.presets.empty.title')"
            :description="t('box-office.presets.empty.description')"
            icon="i-lucide-ticket"
          />
          <RecordList
            v-else
            :label="t('box-office.navigation.ticket-presets.label')"
          >
            <RecordListItem
              v-for="p in d.rows"
              :key="p.id"
              :name="p.name"
              :description="describe(p)"
            >
              <UBadge
                v-if="p.id === d.usual"
                :label="t('box-office.presets.theatre-usual')"
                color="neutral"
                variant="subtle"
              />
              <RowActions
                :items="actions(p)"
                :label="t('box-office.presets.actions', { name: p.name })"
              />
            </RecordListItem>
          </RecordList>
        </div>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('box-office.presets.edit-title') : t('box-office.presets.new')"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <UForm
          id="ticket-preset-form"
          :state="form"
          class="space-y-5"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="formRefusal" />
          <UFormField
            :label="t('box-office.presets.name')"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <BoxOfficeTicketGrid
            v-model="form.sections"
            :types="types"
            :seats-help="t('box-office.presets.seats-help')"
          />
          <UFormField
            v-if="spaceItems.length"
            :label="t('box-office.presets.spaces')"
            :help="t('box-office.presets.spaces-help')"
            name="spaceIds"
          >
            <UCheckboxGroup
              v-model="form.spaceIds"
              :items="spaceItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="ticket-preset-form"
          :label="t('box-office.presets.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
