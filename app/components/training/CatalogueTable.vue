<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { describeExpiry, saysDeliveryMode, saysKind, saysLifecycle } from '#shared/utils/training'
import { trainingModulesList } from '#shared/utils/training-modules-list'
import type { TableColumn } from '@nuxt/ui'
import type { FilterOption } from '#shared/utils/list-filters'
import type { DeliveryMode, ExpiryMode, ModuleKind, ModuleLifecycle } from '#shared/utils/training'

// The table half of the catalogue screen: its own paged read, its own declared filters (K-129),
// and the rows. The editor is a sibling the page wires up (moved out whole, G-129).

interface Material { label: string, url: string }

export interface CatalogueModule {
  id: string
  department: string
  kind: ModuleKind
  name: string
  description: string | null
  notes?: string | null
  deliveryMode: DeliveryMode
  expiryMode: ExpiryMode
  expiryMonths: number | null
  allowsExternal: boolean
  externalEvidence: string | null
  safetyCritical: boolean
  signoffRequired: boolean
  grantsTrainer: boolean
  grantsSupervisor: boolean
  selfRegistrable: boolean
  status: ModuleLifecycle
  sort: number
  materials: Material[]
  prerequisites: { id: string, requiresId: string, requiresName: string }[]
  expiresIfAwardedToday: string | null
  frozen?: boolean
}

interface Department { code: string, name: string }
interface Listing { items: CatalogueModule[], total: number, pageSize: number, pages: number }

const props = defineProps<{ departments: Department[] }>()
const emit = defineEmits<{ add: [], edit: [module: CatalogueModule] }>()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const departmentOptions = computed<Record<string, FilterOption[]>>(() => ({
  department: props.departments.map(one => ({ value: one.code, label: `${one.code} ${one.name}` })),
}))

// Search, filters, sort and page live in the URL (K-129); the table refetches when any changes.
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(trainingModulesList, { options: departmentOptions })

// defineExpose cannot follow an await, so the page's ref calls through this rather than the
// composable's own refresh, which does not exist until the fetch below resolves.
const holder = { refresh: async () => {} }
defineExpose({ refresh: () => holder.refresh() })

const { data, status: loading, refresh } = await useAsyncData(
  'training-modules',
  () => request<Listing>('/api/admin/training/modules', { query: query.value }),
  { watch: [query], default: empty },
)
holder.refresh = refresh

const columns: TableColumn<CatalogueModule>[] = [
  {
    id: 'name',
    header: 'Module',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', { class: 'font-mono text-sm' }, row.original.id),
        h('span', {}, row.original.name),
        row.original.safetyCritical
          ? h(UBadge, { color: 'error', variant: 'subtle', size: 'sm' }, () => 'Safety critical')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' },
        `${row.original.department} · ${saysKind(row.original.kind)} · ${saysDeliveryMode(row.original.deliveryMode)}`),
    ]),
  },
  {
    id: 'expiry',
    header: 'Lifetime',
    meta: { class: { td: 'text-sm whitespace-nowrap' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, describeExpiry(row.original)),
      // Computed on the way out of every request: the catalogue stores a policy, and an award
      // stamps the date it works out to on the day (G-123 criterion 3).
      h('div', { class: 'text-xs text-muted' }, row.original.expiresIfAwardedToday
        ? `Earned today, it would run to ${row.original.expiresIfAwardedToday}`
        : 'Earned today, it would never lapse'),
    ]),
  },
  {
    id: 'grants',
    header: 'Grants',
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, [
      row.original.grantsTrainer
        ? h(UBadge, { color: 'primary', variant: 'subtle', size: 'sm' }, () => 'Trainer')
        : null,
      row.original.grantsSupervisor
        ? h(UBadge, { color: 'primary', variant: 'subtle', size: 'sm' }, () => 'Supervisor')
        : null,
      row.original.signoffRequired
        ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Sign-off')
        : null,
    ]),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      color: row.original.status === 'ACTIVE' ? 'success' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => saysLifecycle(row.original.status)),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'data-test': `edit-module-${row.original.id}`,
      'onClick': () => emit('edit', row.original),
    }, () => 'Edit'),
  },
]
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar
      v-model:search="search"
      :placeholder="trainingModulesList.search?.placeholder"
      :active="active"
      :loading="loading === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="trainingModulesList"
          :conditions="conditions"
          :sort="sort"
          :options="departmentOptions"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          data-test="add-module"
          icon="i-lucide-plus"
          :disabled="departments.length === 0"
          @click="emit('add')"
        >
          Add a module
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="loading === 'pending'"
      data-test="modules-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ departments.length === 0
            ? 'Add a department first: every module belongs to one.'
            : filtered ? 'No module matches that.' : 'Nothing in the catalogue yet. Add a module and it starts as a draft.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="modules-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'module') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>
  </div>
</template>
