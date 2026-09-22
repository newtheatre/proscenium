<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageChecklist } from '#shared/utils/abilities'
import { PHASES, SYSTEM_CHECKS, checklistItemForm, saysPhase, saysSystemCheck } from '#shared/utils/checklist'
import { checklistVenuesList } from '#shared/utils/checklist-venues-list'
import type { Phase, SystemCheck } from '#shared/utils/checklist'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Checklists', middleware: 'console', docs: '/docs/rota/checklists' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Item { id: string, phase: Phase, label: string, sort: number, required: boolean, systemCheck: SystemCheck | null, active: boolean }
interface VenueChecklist { venueId: string, venueName: string, items: Item[] }

interface Listing {
  venues: VenueChecklist[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse (0040).
const writes = computed(() => can(useViewer().value, manageChecklist))
const failure = ref<string | null>(null)
const saving = ref(false)

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(checklistVenuesList)

const empty = (): Listing => ({ venues: [], page: 1, pageSize: 0, total: 0, pages: 1 })

const { data, status, refresh } = await useAsyncData(
  'checklist-venues',
  () => request<Listing>('/api/admin/checklist', { query: query.value }),
  { watch: [query], default: empty },
)

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

// Retiring confirms; reinstating an item does not (K-123 criterion 7).
const retiring = ref<{ venueId: string, item: Item } | null>(null)
const retireFailure = ref<string | null>(null)
const retireWorking = ref(false)

async function retire(): Promise<void> {
  const asked = retiring.value
  if (!asked) return
  retireWorking.value = true
  retireFailure.value = null
  try {
    await $fetch(`/api/admin/checklist/items/${asked.item.id}/status`, { method: 'POST', body: { venueId: asked.venueId, active: false } })
    toast.add({ title: 'Item retired', icon: 'i-lucide-check', color: 'success' })
    retiring.value = null
    await refresh()
  }
  catch (error) {
    retireFailure.value = refusalText(error)
  }
  finally {
    retireWorking.value = false
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
          h('div', { class: item.active ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-2 text-muted' }, [
            h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysPhase(item.phase)),
            h('span', { class: 'text-sm' }, item.label),
            item.systemCheck ? h(UBadge, { color: 'primary', variant: 'subtle', size: 'sm' }, () => 'System-verified') : null,
            item.required ? null : h('span', { class: 'text-xs text-muted' }, '(optional)'),
            item.active ? null : h(UBadge, { 'color': 'neutral', 'variant': 'outline', 'size': 'sm', 'data-test': `retired-item-${item.id}` }, () => 'Retired'),
            writes.value === false
              ? null
              : h('div', { class: 'ml-auto flex gap-1' }, item.active
                  ? [
                      h(UButton, {
                        'size': 'xs', 'color': 'neutral', 'variant': 'ghost',
                        'data-test': `edit-item-${item.id}`,
                        'onClick': () => editItem(row.original.venueId, item),
                      }, () => 'Edit'),
                      h(UButton, {
                        'size': 'xs', 'color': 'neutral', 'variant': 'ghost',
                        'data-test': `retire-item-${item.id}`,
                        'onClick': () => {
                          retireFailure.value = null
                          retiring.value = { venueId: row.original.venueId, item }
                        },
                      }, () => 'Retire'),
                    ]
                  : [
                      h(UButton, {
                        'size': 'xs', 'color': 'neutral', 'variant': 'ghost',
                        'data-test': `reinstate-item-${item.id}`,
                        'onClick': () => setActive(row.original.venueId, item, true),
                      }, () => 'Reinstate'),
                    ]),
          ])))),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
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

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => open.value || retiring.value !== null)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      What each venue works through on a show night.
    </p>

    <AdminToolbar
      v-model:search="search"
      :placeholder="checklistVenuesList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="checklistVenuesList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="data.venues"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="checklists-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No venue matches that.' : 'No venues yet.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="checklists-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'venue') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="open"
      :title="editing?.item ? 'Edit checklist item' : 'Add a checklist item'"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="failure"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="failure"
        />
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
          Save the item
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      :open="retiring !== null"
      name="retire-item"
      title="Retire this item"
      verb="Retire the item"
      :consequence="retiring ? `${retiring.item.label} leaves the checklist from the next show night. Nights already signed off keep it.` : ''"
      :loading="retireWorking"
      :failure="retireFailure"
      @update:open="value => { if (!value) retiring = null }"
      @confirm="retire"
    />
  </div>
</template>
