<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  DELIVERY_MODES,
  EXPIRY_MODES,
  MAX_EXPIRY_MONTHS,
  MODULE_KINDS,
  MODULE_LIFECYCLE,
  describeExpiry,
  moduleForm,
  newModuleForm,
  saysDeliveryMode,
  saysKind,
  saysLifecycle,
} from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { DeliveryMode, ExpiryMode, ModuleInput, ModuleKind, ModuleLifecycle } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Training catalogue', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Material { label: string, url: string }

interface Module {
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

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const department = ref<string | null>(null)
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'training-modules',
  () => request<{ items: Module[], total: number }>('/api/admin/training/modules'),
  { default: (): { items: Module[], total: number } => ({ items: [], total: 0 }) },
)

const { data: departments } = await useAsyncData(
  'training-modules-departments',
  () => request<{ items: Department[] }>('/api/admin/training/departments'),
  { default: () => ({ items: [] as Department[] }) },
)

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  return data.value.items.filter(module =>
    (!department.value || module.department === department.value)
    && (!term || [module.id, module.name].some(field => field.toLowerCase().includes(term))))
})

const editing = ref<Module | null>(null)
const open = ref(false)

interface FormState {
  id: string
  department: string
  kind: ModuleKind
  name: string
  description?: string
  notes?: string
  deliveryMode: DeliveryMode
  expiryMode: ExpiryMode
  expiryMonths?: number
  allowsExternal: boolean
  externalEvidence?: string
  safetyCritical: boolean
  signoffRequired: boolean
  grantsTrainer: boolean
  grantsSupervisor: boolean
  selfRegistrable: boolean
  status: ModuleLifecycle
  sort: number
  materials: Material[]
}

const state = reactive<FormState>(blank())

// Every key, including the ones that may be absent: this is assigned over the last form's state,
// so a field left out here keeps whatever the module before it had.
function blank(): FormState {
  return {
    id: '',
    department: '',
    kind: 'MODULE',
    name: '',
    description: undefined,
    notes: undefined,
    deliveryMode: 'IN_PERSON',
    expiryMode: 'NONE',
    expiryMonths: undefined,
    allowsExternal: false,
    externalEvidence: undefined,
    safetyCritical: false,
    signoffRequired: false,
    grantsTrainer: false,
    grantsSupervisor: false,
    selfRegistrable: false,
    status: 'DRAFT',
    sort: 0,
    materials: [],
  }
}

function edit(module: Module | null): void {
  editing.value = module
  Object.assign(state, blank(), module
    ? {
        id: module.id,
        department: module.department,
        kind: module.kind as ModuleKind,
        name: module.name,
        description: module.description ?? undefined,
        notes: module.notes ?? undefined,
        deliveryMode: module.deliveryMode as DeliveryMode,
        expiryMode: module.expiryMode as ExpiryMode,
        expiryMonths: module.expiryMonths ?? undefined,
        allowsExternal: module.allowsExternal,
        externalEvidence: module.externalEvidence ?? undefined,
        safetyCritical: module.safetyCritical,
        signoffRequired: module.signoffRequired,
        grantsTrainer: module.grantsTrainer,
        grantsSupervisor: module.grantsSupervisor,
        selfRegistrable: module.selfRegistrable,
        status: module.status as ModuleLifecycle,
        sort: module.sort,
        materials: module.materials.map(material => ({ ...material })),
      }
    : { department: departments.value.items[0]?.code ?? '' })
  open.value = true
}

// Records against the module fix what it means, so the screen says so rather than offering an edit
// the write path will refuse (G-109).
const frozen = computed(() => editing.value?.frozen === true)

const departmentOptions = computed(() => departments.value.items
  .map(one => ({ label: `${one.code} ${one.name}`, value: one.code })))

const kindOptions = MODULE_KINDS.map(option => ({ label: saysKind(option), value: option }))
const lifecycleOptions = MODULE_LIFECYCLE.map(option => ({ label: saysLifecycle(option), value: option }))

// A safety-critical module may never be fully self-directed, so that mode is not offered rather
// than offered and refused (G-107 criterion 2).
const modeOptions = computed(() => DELIVERY_MODES
  .filter(option => !(state.safetyCritical && option === 'SELF_DIRECTED'))
  .map(option => ({ label: saysDeliveryMode(option), value: option })))

const expiryOptions = computed(() => EXPIRY_MODES
  .map(option => ({
    label: describeExpiry({ expiryMode: option, expiryMonths: state.expiryMonths ?? null }),
    value: option,
  })))

// Only a certification confers standing (G-111). An older module that already carries it keeps the
// switches on screen, because clearing one silently would be refused later as a frozen change.
const confersStanding = computed(() =>
  state.kind === 'CERTIFICATION' || state.grantsTrainer || state.grantsSupervisor)

// Every field the form hides is cleared here, in one place, so a rule and the field it governs
// cannot drift apart: what is not shown is never what gets submitted (G-107 criteria 2 and 4).
watch(
  () => [state.kind, state.expiryMode, state.safetyCritical, state.allowsExternal] as const,
  () => {
    if (state.kind === 'BRIEF') {
      state.expiryMode = 'NONE'
      state.allowsExternal = false
    }
    else {
      state.selfRegistrable = false
    }
    if (state.kind !== 'CERTIFICATION') {
      state.grantsTrainer = false
      state.grantsSupervisor = false
    }
    state.expiryMonths = state.expiryMode === 'MONTHS' ? (state.expiryMonths ?? 12) : undefined
    if (!state.allowsExternal) state.externalEvidence = undefined
    if (state.safetyCritical && state.deliveryMode === 'SELF_DIRECTED') state.deliveryMode = 'HYBRID'
  },
)

function addMaterial(): void {
  state.materials.push({ label: '', url: '' })
}

async function save(event: FormSubmitEvent<ModuleInput & { id?: string }>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    if (editing.value) {
      await $fetch(`/api/admin/training/modules/${editing.value.id}`, { method: 'PUT', body: event.data })
    }
    else {
      await $fetch('/api/admin/training/modules', { method: 'POST', body: event.data })
    }
    toast.add({ title: editing.value ? 'Module changed' : 'Module added', icon: 'i-lucide-check', color: 'success' })
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

const columns: TableColumn<Module>[] = [
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
      'onClick': () => edit(row.original),
    }, () => 'Edit'),
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
      icon="i-lucide-graduation-cap"
      title="What the theatre teaches, and how long each one is worth"
      description="A module declares its expiry policy once. Whether somebody currently holds it is worked out from the dates on their record every time it is asked, so nothing here has to be kept up to date."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A module id or its title"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; department = null"
    >
      <template #filters>
        <UFormField label="Department">
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="option in departments.items"
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
          :disabled="departments.items.length === 0"
          @click="edit(null)"
        >
          Add a module
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="modules-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ departments.items.length === 0
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

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.id}` : 'Add a module'"
      description="The published id is what members quote and what a certificate carries, so it is fixed once the module exists."
    >
      <template #body>
        <UForm
          :schema="editing ? moduleForm : newModuleForm"
          :state="state"
          class="space-y-4"
          data-test="module-form"
          @submit="save"
        >
          <UFormField
            v-if="!editing"
            label="Published id"
            name="id"
            required
            description="Uppercase letters, digits and hyphens. TECH-111, FOH-101."
          >
            <UInput
              v-model="state.id"
              class="w-full"
              data-test="module-id"
            />
          </UFormField>

          <UFormField
            label="Title"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="module-name"
            />
          </UFormField>

          <UFormField
            label="What it covers"
            name="description"
            hint="Optional"
            description="Shown to members in the catalogue, so write it for somebody deciding whether to take it."
          >
            <UTextarea
              v-model="state.description"
              :rows="3"
              class="w-full"
              data-test="module-description"
            />
          </UFormField>

          <UFormField
            label="Department"
            name="department"
            required
          >
            <USelectMenu
              v-model="state.department"
              :items="departmentOptions"
              value-key="value"
              placeholder="Choose a department"
              class="w-full"
              data-test="module-department"
            />
          </UFormField>

          <UFormField
            label="Kind"
            name="kind"
            required
            description="A brief is taught once: it carries no expiry, grants no standing and cannot be a prerequisite."
          >
            <USelectMenu
              v-model="state.kind"
              :items="kindOptions"
              value-key="value"
              :disabled="frozen"
              class="w-full"
              data-test="module-kind"
            />
            <p
              v-if="frozen"
              class="mt-2 text-sm text-muted"
              data-test="module-frozen"
            >
              Records exist against this module, so its kind and the standing it grants are fixed.
              Retire it and create a successor to mean something else.
            </p>
          </UFormField>

          <UFormField
            label="How it is delivered"
            name="deliveryMode"
            required
            :description="state.safetyCritical
              ? 'A safety-critical module can never be fully self-directed: online content may gate the in-person assessment, never replace it.'
              : undefined"
          >
            <USelectMenu
              v-model="state.deliveryMode"
              :items="modeOptions"
              value-key="value"
              class="w-full"
              data-test="module-mode"
            />
          </UFormField>

          <UFormField
            v-if="state.kind !== 'BRIEF'"
            label="How long it is worth"
            name="expiryMode"
            required
            description="Stamped on a record the day it is earned and never recomputed by a later change to this."
          >
            <USelectMenu
              v-model="state.expiryMode"
              :items="expiryOptions"
              value-key="value"
              class="w-full"
              data-test="module-expiry"
            />
          </UFormField>

          <UFormField
            v-if="state.kind !== 'BRIEF' && state.expiryMode === 'MONTHS'"
            label="Months from award"
            name="expiryMonths"
            required
            :description="`At most ${MAX_EXPIRY_MONTHS}.`"
          >
            <UInputNumber
              v-model="state.expiryMonths"
              :min="1"
              :max="MAX_EXPIRY_MONTHS"
              class="w-full"
              data-test="module-months"
            />
          </UFormField>

          <UFormField
            label="Status"
            name="status"
            required
            description="A draft is invisible to members. Retiring one blocks new sessions and sign-offs and leaves existing records readable."
          >
            <USelectMenu
              v-model="state.status"
              :items="lifecycleOptions"
              value-key="value"
              class="w-full"
              data-test="module-status"
            />
          </UFormField>

          <div class="space-y-3">
            <USwitch
              v-model="state.safetyCritical"
              label="Safety critical"
              data-test="module-safety-critical"
            />
            <USwitch
              v-model="state.signoffRequired"
              label="Awarded by sign-off rather than by a register"
            />
            <USwitch
              v-if="confersStanding"
              v-model="state.grantsTrainer"
              :disabled="frozen"
              label="Holding it makes somebody a trainer"
              description="Standing is derived from a current record on this module, never granted as a role."
              data-test="module-grants-trainer"
            />
            <USwitch
              v-if="confersStanding"
              v-model="state.grantsSupervisor"
              :disabled="frozen"
              label="Holding it makes somebody a supervisor"
            />
            <USwitch
              v-if="state.kind !== 'BRIEF'"
              v-model="state.allowsExternal"
              label="An external certificate can satisfy it"
              data-test="module-allows-external"
            />
            <USwitch
              v-if="state.kind === 'BRIEF'"
              v-model="state.selfRegistrable"
              label="People can register themselves for it"
            />
          </div>

          <UFormField
            v-if="state.kind !== 'BRIEF' && state.allowsExternal"
            label="Evidence we accept"
            name="externalEvidence"
            hint="Optional"
            description="Named on the screen that records one, so whoever is holding a certificate knows whether it counts."
          >
            <UInput
              v-model="state.externalEvidence"
              placeholder="A current first aid at work certificate"
              class="w-full"
              data-test="module-external-evidence"
            />
          </UFormField>

          <UFormField
            label="Where it sits in the list"
            name="sort"
            description="Lower comes first. Modules sharing a number fall back to their published id."
          >
            <UInputNumber
              v-model="state.sort"
              :min="0"
              :max="9999"
              class="w-full"
              data-test="module-sort"
            />
          </UFormField>

          <UFormField
            v-if="editing"
            label="Needs first"
            description="Direct edges only. A brief can never be required, and a loop is refused by naming it."
          >
            <PrerequisiteEditor
              :module-id="editing.id"
              :prerequisites="editing.prerequisites"
              :candidates="data.items"
              @changed="refresh()"
              @failed="message => failure = message"
            />
          </UFormField>

          <UFormField
            label="Notes for leads"
            name="notes"
            hint="Optional"
            description="Not shown to members."
          >
            <UTextarea
              v-model="state.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Material links">
            <div class="space-y-2">
              <div
                v-for="(material, index) in state.materials"
                :key="index"
                class="flex flex-wrap items-center gap-2"
              >
                <UInput
                  v-model="material.label"
                  placeholder="What it is"
                  :data-test="`material-label-${index}`"
                />
                <UInput
                  v-model="material.url"
                  placeholder="https://"
                  class="flex-1"
                  :data-test="`material-url-${index}`"
                />
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="`Remove material link ${index + 1}`"
                  @click="state.materials.splice(index, 1)"
                />
              </div>
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-plus"
                data-test="add-material"
                @click="addMaterial"
              >
                Add a link
              </UButton>
            </div>
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="module-submit"
            >
              {{ editing ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              data-test="module-cancel"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
