<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { departmentForm, newDepartmentForm } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { DepartmentInput } from '#shared/utils/training'

definePageMeta({ layout: 'admin', title: 'Departments', middleware: 'signed-in' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Lead {
  id: string
  userId: string
  name: string
  expiresAt: number | null
}

interface Department {
  code: string
  name: string
  description: string | null
  isActive: boolean
  sort: number
  leads: Lead[]
}

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeInactive = ref(false)
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'training-departments',
  () => request<{ items: Department[], total: number }>('/api/admin/training/departments', {
    query: { includeInactive: includeInactive.value },
  }),
  { watch: [includeInactive], default: (): { items: Department[], total: number } => ({ items: [], total: 0 }) },
)

// Searched in the browser: a department vocabulary is tens of rows, and a round trip to filter
// them would be slower than the typing.
const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(department =>
    [department.code, department.name].some(field => field.toLowerCase().includes(term)))
})

const editing = ref<Department | null>(null)
const open = ref(false)
const state = reactive<{ code: string, name: string, description?: string, isActive: boolean, sort: number }>({
  code: '',
  name: '',
  isActive: true,
  sort: 0,
})

const appointing = ref<Department | null>(null)
const appointee = ref<string | undefined>(undefined)

function edit(department: Department | null): void {
  editing.value = department
  Object.assign(state, {
    code: department?.code ?? '',
    name: department?.name ?? '',
    description: department?.description ?? undefined,
    isActive: department?.isActive ?? true,
    sort: department?.sort ?? 0,
  })
  open.value = true
}

async function save(event: FormSubmitEvent<DepartmentInput & { code?: string }>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    if (editing.value) {
      await $fetch(`/api/admin/training/departments/${editing.value.code}`, { method: 'PUT', body: event.data })
    }
    else {
      await $fetch('/api/admin/training/departments', { method: 'POST', body: event.data })
    }
    toast.add({ title: editing.value ? 'Department changed' : 'Department added', icon: 'i-lucide-check', color: 'success' })
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

async function appoint(): Promise<void> {
  const department = appointing.value
  if (!department || !appointee.value) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/training/departments/${department.code}/leads`, {
      method: 'POST',
      body: { userId: appointee.value },
    })
    toast.add({
      title: 'Lead assigned',
      description: 'It lapses at handover unless somebody renews it.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    appointing.value = null
    appointee.value = undefined
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function standDown(lead: Lead): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/training/leads/${lead.id}`, { method: 'DELETE' })
    toast.add({ title: 'Lead removed', description: 'It stops counting on their next request.', icon: 'i-lucide-check' })
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
  if (includeInactive.value) {
    active.push({ key: 'retired', label: 'Including retired', icon: 'i-lucide-history', clear: () => {
      includeInactive.value = false
    } })
  }
  return active
})

const columns: TableColumn<Department>[] = [
  {
    id: 'name',
    header: 'Department',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', {}, row.original.name),
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => row.original.code),
        row.original.isActive ? null : h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Retired'),
      ]),
      row.original.description
        ? h('div', { class: 'text-xs text-muted' }, row.original.description)
        : null,
    ]),
  },
  {
    id: 'leads',
    header: 'Led by',
    cell: ({ row }) => (row.original.leads.length === 0
      ? h('span', { class: 'text-sm text-muted' }, 'Nobody')
      : h('div', { class: 'flex flex-wrap gap-2' }, row.original.leads.map(lead =>
          h('span', { class: 'flex items-center gap-1 text-sm' }, [
            lead.name,
            h(UButton, {
              'icon': 'i-lucide-x',
              'size': 'xs',
              'color': 'neutral',
              'variant': 'ghost',
              'aria-label': `Remove ${lead.name} as a lead of ${row.original.name}`,
              'data-test': `stand-down-${lead.id}`,
              'onClick': () => standDown(lead),
            }),
          ])))),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'variant': 'subtle',
        'data-test': `appoint-${row.original.code}`,
        'onClick': () => {
          appointing.value = row.original
          appointee.value = undefined
        },
      }, () => 'Assign a lead'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-department-${row.original.code}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
    ]),
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
      icon="i-lucide-building-2"
      title="Departments own their modules, and their leads steward them"
      description="A lead edits their own department's catalogue without holding an officer role. Standing is read on every request and lapses at handover, so nothing has to be remembered in July."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A department or its code"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeInactive = false"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeInactive"
            label="Including retired departments"
            data-test="departments-retired"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-department"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a department
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="departments-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No departments yet. Add one and modules can be scoped to it.
        </p>
      </template>
    </UTable>

    <p
      data-test="departments-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'department') }}
    </p>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a department'"
      description="The code is what modules reference, so it is fixed once the department exists."
    >
      <template #body>
        <UForm
          :schema="editing ? departmentForm : newDepartmentForm"
          :state="state"
          class="space-y-4"
          data-test="department-form"
          @submit="save"
        >
          <UFormField
            v-if="!editing"
            label="Code"
            name="code"
            required
            description="Uppercase letters, digits and hyphens. TECH, BACKSTAGE, FOH."
          >
            <UInput
              v-model="state.code"
              class="w-full"
              data-test="department-code"
            />
          </UFormField>

          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="department-name"
            />
          </UFormField>

          <UFormField
            label="What it covers"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <USwitch
            v-model="state.isActive"
            label="Still in use"
            description="A retired department keeps its modules readable and takes no new ones."
            data-test="department-active"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="department-submit"
            >
              {{ editing ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="appointing !== null"
      :title="appointing ? `Assign a lead of ${appointing.name}` : ''"
      description="The assignment lapses at handover on 31 July unless somebody renews it, and removing it takes effect on their next request."
      @update:open="appointing = null"
    >
      <template #body>
        <UFormField
          label="Who leads it"
          description="They need an account. A person may lead more than one department."
          required
        >
          <PersonPicker
            v-model="appointee"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          :disabled="!appointee"
          data-test="appoint-submit"
          @click="appoint"
        >
          Assign
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="appointing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
