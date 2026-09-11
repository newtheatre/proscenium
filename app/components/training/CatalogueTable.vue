<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { describeExpiry, saysDeliveryMode, saysKind, saysLifecycle } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { DeliveryMode, ExpiryMode, ModuleKind, ModuleLifecycle } from '#shared/utils/training'

// The table half of the catalogue screen: search, the department toggles and the rows
// themselves. The editor is a sibling the page wires up (moved out whole, G-129).

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

const props = defineProps<{
  modules: CatalogueModule[]
  departments: Department[]
  loading: boolean
}>()

const emit = defineEmits<{ add: [], edit: [module: CatalogueModule] }>()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const search = ref('')
const department = ref<string | null>(null)

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  return props.modules.filter(module =>
    (!department.value || module.department === department.value)
    && (!term || [module.id, module.name].some(field => field.toLowerCase().includes(term))))
})

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (department.value) {
    active.push({ key: 'department', label: department.value, icon: 'i-lucide-building-2', clear: () => {
      department.value = null
    } })
  }
  return active
})

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
      placeholder="A module id or its title"
      :active="activeFilters"
      :loading="loading"
      @clear="search = ''; department = null"
    >
      <template #filters>
        <UFormField label="Department">
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="option in departments"
              :key="option.code"
              size="sm"
              :color="department === option.code ? 'primary' : 'neutral'"
              :variant="department === option.code ? 'solid' : 'outline'"
              :aria-pressed="department === option.code"
              :data-test="`filter-department-${option.code}`"
              @click="department = department === option.code ? null : option.code"
            >
              {{ option.code }}
            </UButton>
          </div>
        </UFormField>
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
      :data="shown"
      :columns="columns"
      :loading="loading"
      data-test="modules-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ departments.length === 0
            ? 'Add a department first: every module belongs to one.'
            : 'Nothing in the catalogue yet. Add a module and it starts as a draft.' }}
        </p>
      </template>
    </UTable>

    <p
      data-test="modules-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'module') }}
    </p>
  </div>
</template>
