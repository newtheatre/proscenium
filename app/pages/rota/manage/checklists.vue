<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageChecklist } from '#shared/utils/abilities'
import { PHASES, SYSTEM_CHECKS, checklistItemForm, saysPhase, saysSystemCheck } from '#shared/utils/checklist'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { Phase, SystemCheck } from '#shared/utils/checklist'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Checklists', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Item { id: string, phase: Phase, label: string, sort: number, required: boolean, systemCheck: SystemCheck | null }
interface VenueChecklist { venueId: string, venueName: string, items: Item[] }

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse (0040).
const writes = computed(() => can(useViewer().value, manageChecklist))
const search = ref('')
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'checklist-venues',
  () => request<{ venues: VenueChecklist[] }>('/api/admin/checklist'),
  { default: (): { venues: VenueChecklist[] } => ({ venues: [] }) },
)

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.venues
  return data.value.venues.filter(venue => venue.venueName.toLowerCase().includes(term))
})

interface FormState {
  venueId: string
  phase: Phase
  label: string
  sort: number
  required: boolean
  systemCheck: SystemCheck | null
}

const editing = ref<{ venueId: string, item: Item | null } | null>(null)
const open = ref(false)
const state = reactive<FormState>({ venueId: '', phase: 'PRE', label: '', sort: 1, required: true, systemCheck: null })

const phaseOptions = PHASES.map(value => ({ label: saysPhase(value), value }))
const systemCheckOptions = [{ label: 'Hand-ticked', value: null }, ...SYSTEM_CHECKS.map(value => ({ label: saysSystemCheck(value), value }))]

function addItem(venueId: string): void {
  editing.value = { venueId, item: null }
  Object.assign(state, { venueId, phase: 'PRE', label: '', sort: 1, required: true, systemCheck: null })
  failure.value = null
  open.value = true
}

function editItem(venueId: string, item: Item): void {
  editing.value = { venueId, item }
  Object.assign(state, { venueId, phase: item.phase, label: item.label, sort: item.sort, required: item.required, systemCheck: item.systemCheck })
  failure.value = null
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    if (editing.value?.item) await $fetch(`/api/admin/checklist/items/${editing.value.item.id}`, { method: 'PUT', body: state })
    else await $fetch('/api/admin/checklist/items', { method: 'POST', body: state })

    toast.add({ title: editing.value?.item ? 'Checklist item changed' : 'Checklist item added', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function setActive(venueId: string, item: Item, active: boolean): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/checklist/items/${item.id}/status`, { method: 'POST', body: { venueId, active } })
    toast.add({ title: active ? 'Item reinstated' : 'Item retired', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  return active
})

const refusal = computed(() => (checklistItemForm.safeParse(state).success ? null : 'Give the item a label'))

const columns: TableColumn<VenueChecklist>[] = [
  {
    id: 'venue',
    header: 'Venue',
    cell: ({ row }) => h('span', {}, row.original.venueName),
  },
  {
    id: 'items',
    header: 'Checklist',
    cell: ({ row }) => (row.original.items.length === 0
      ? h('span', { class: 'text-sm text-muted' }, 'Nothing configured yet')
      : h('div', { class: 'space-y-1' }, row.original.items.map(item =>
          h('div', { class: 'flex flex-wrap items-center gap-2' }, [
            h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysPhase(item.phase)),
            h('span', { class: 'text-sm' }, item.label),
            item.systemCheck ? h(UBadge, { color: 'primary', variant: 'subtle', size: 'sm' }, () => 'System-verified') : null,
            item.required ? null : h('span', { class: 'text-xs text-muted' }, '(optional)'),
            writes.value === false
              ? null
              : h('div', { class: 'ml-auto flex gap-1' }, [
                  h(UButton, {
                    'size': 'xs', 'color': 'neutral', 'variant': 'ghost',
                    'data-test': `edit-item-${item.id}`,
                    'onClick': () => editItem(row.original.venueId, item),
                  }, () => 'Edit'),
                  h(UButton, {
                    'size': 'xs', 'color': 'neutral', 'variant': 'ghost',
                    'data-test': `retire-item-${item.id}`,
                    'onClick': () => setActive(row.original.venueId, item, false),
                  }, () => 'Retire'),
                ]),
          ])))),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (writes.value === false
      ? null
      : h(UButton, {
          'size': 'sm', 'variant': 'subtle',
          'data-test': `add-item-${row.original.venueId}`,
          'onClick': () => addItem(row.original.venueId),
        }, () => 'Add an item')),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-list-checks"
      title="Changes here apply from the next show night"
      description="A night already touched keeps the checklist it was stamped with, so editing an item tonight changes nothing about tonight."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A venue"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''"
    />

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="checklists-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No venues yet.
        </p>
      </template>
    </UTable>

    <UModal
      v-model:open="open"
      :title="editing?.item ? 'Edit checklist item' : 'Add a checklist item'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Phase">
            <USelect
              v-model="state.phase"
              :items="phaseOptions"
              class="w-full"
              data-test="item-phase"
            />
          </UFormField>

          <UFormField label="Label">
            <UInput
              v-model="state.label"
              class="w-full"
              data-test="item-label"
            />
          </UFormField>

          <UFormField
            label="Order"
            description="Lowest first."
          >
            <UInputNumber
              v-model="state.sort"
              :min="0"
              class="w-full"
              data-test="item-sort"
            />
          </UFormField>

          <UFormField
            label="How it ticks"
            description="A system-verified item ticks itself from data and cannot be hand-ticked."
          >
            <USelect
              v-model="state.systemCheck"
              :items="systemCheckOptions"
              class="w-full"
              data-test="item-system-check"
            />
          </UFormField>

          <USwitch
            v-model="state.required"
            label="Required"
            description="Blocks closing the night until ticked or closed over with a reason."
            data-test="item-required"
          />

          <UAlert
            v-if="refusal"
            color="warning"
            variant="subtle"
            data-test="item-refusal"
            :description="refusal"
          />
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          :disabled="refusal !== null"
          data-test="item-submit"
          @click="save"
        >
          Save it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
