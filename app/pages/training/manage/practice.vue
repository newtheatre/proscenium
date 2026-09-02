<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { MAX_PRACTICE_WINDOW_HOURS, newPracticeTargetForm, practiceTargetForm } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { PracticeTargetInput } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Practice surfaces', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Target {
  key: string
  name: string
  description: string | null
  windowHours: number
  isActive: boolean
  moduleIds: string[]
}

interface Module { id: string, name: string, status: string }

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const failure = ref<string | null>(null)
const saving = ref(false)
const editing = ref<string | null>(null)
const open = ref(false)

const { data, status, error, refresh } = await useAsyncData(
  'practice-targets',
  () => request<{ items: Target[] }>('/api/admin/training/practice-targets'),
  { default: () => ({ items: [] as Target[] }) },
)

const { data: catalogue } = await useAsyncData(
  'practice-target-modules',
  () => request<{ items: Module[] }>('/api/admin/training/modules'),
  { default: () => ({ items: [] as Module[] }) },
)

const teachable = computed(() => catalogue.value.items.filter(module => module.status === 'ACTIVE'))

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(target =>
    [target.key, target.name, ...target.moduleIds].some(field => field.toLowerCase().includes(term)))
})

const state = reactive<{
  key: string
  name: string
  description?: string
  windowHours: number
  isActive: boolean
  moduleIds: string[]
}>({ key: '', name: '', windowHours: 72, isActive: true, moduleIds: [] })

function begin(target?: Target): void {
  editing.value = target?.key ?? null
  Object.assign(state, {
    key: target?.key ?? '',
    name: target?.name ?? '',
    description: target?.description ?? undefined,
    windowHours: target?.windowHours ?? 72,
    isActive: target?.isActive ?? true,
    moduleIds: target ? [...target.moduleIds] : [],
  })
  open.value = true
}

function toggle(id: string): void {
  state.moduleIds = state.moduleIds.includes(id)
    ? state.moduleIds.filter(one => one !== id)
    : [...state.moduleIds, id]
}

async function save(event: FormSubmitEvent<PracticeTargetInput>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    if (editing.value) {
      await $fetch(`/api/admin/training/practice-targets/${editing.value}`, { method: 'PUT', body: event.data })
    }
    else {
      await $fetch('/api/admin/training/practice-targets', { method: 'POST', body: { ...event.data, key: state.key } })
    }
    toast.add({ title: 'Saved', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await refresh()
  }
  catch (caught) {
    failure.value = refusalText(caught)
  }
  finally {
    saving.value = false
  }
}

const activeFilters = computed<ActiveFilter[]>(() => search.value
  ? [{ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } }]
  : [])

const columns: TableColumn<Target>[] = [
  {
    id: 'key',
    header: 'Key',
    meta: { class: { td: 'font-mono text-sm whitespace-nowrap' } },
    cell: ({ row }) => row.original.key,
  },
  {
    id: 'name',
    header: 'Surface',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'font-medium' }, row.original.name),
      h('div', { class: 'text-xs text-muted' }, row.original.description ?? ''),
    ]),
  },
  {
    id: 'opens',
    header: 'Opened by',
    cell: ({ row }) => row.original.moduleIds.length === 0
      ? h('span', { class: 'text-sm text-muted' }, 'Nothing yet')
      : h('div', { class: 'flex flex-wrap gap-1' }, row.original.moduleIds.map(id =>
          h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => id))),
  },
  {
    id: 'window',
    header: 'Lasts',
    meta: { class: { td: 'text-sm text-muted whitespace-nowrap' } },
    cell: ({ row }) => plural(row.original.windowHours, 'hour'),
  },
  {
    id: 'state',
    header: 'In use',
    cell: ({ row }) => h(UBadge, {
      color: row.original.isActive ? 'success' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => (row.original.isActive ? 'In use' : 'Retired')),
  },
  {
    id: 'edit',
    header: '',
    cell: ({ row }) => h(UButton, {
      'size': 'xs',
      'color': 'neutral',
      'variant': 'ghost',
      'data-test': `edit-${row.original.key}`,
      'onClick': () => begin(row.original),
    }, () => 'Change'),
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
      icon="i-lucide-joystick"
      title="Where somebody may rehearse once they have been taught"
      description="Marking a register opens a window on every surface the session's modules map to. A window is access, not a note: while it is open the surface lets them in, and when it lapses it stops."
    />

    <!-- A failed read and an empty one look the same, and "nothing opens the till sandbox" is an
      answer somebody would act on. -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-unplug"
      data-test="load-failed"
      title="The surfaces could not be read"
      description="This is not the same as there being none. Reload, and if it keeps happening say so."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A key, a name or a module id"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''"
    >
      <template #actions>
        <UButton
          data-test="add-target"
          icon="i-lucide-plus"
          @click="begin()"
        >
          Add a surface
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="targets-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No practice surfaces yet. One maps the modules that teach a thing to the sandbox where it
          can be rehearsed.
        </p>
      </template>
    </UTable>

    <UModal
      v-model:open="open"
      :title="editing ? 'Change this surface' : 'Add a practice surface'"
      description="The key is what a sandbox quotes when it asks whether somebody may practise, so it never changes once it exists."
    >
      <template #body>
        <UForm
          :schema="editing ? practiceTargetForm : newPracticeTargetForm"
          :state="state"
          class="space-y-4"
          data-test="target-form"
          @submit="save"
        >
          <UFormField
            label="Key"
            name="key"
            required
            description="Lower case, digits and hyphens. Immutable once created."
          >
            <UInput
              v-model="state.key"
              :disabled="editing !== null"
              placeholder="till-sandbox"
              class="w-full"
              data-test="target-key"
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
              data-test="target-name"
            />
          </UFormField>

          <UFormField
            label="What it is"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="A window lasts"
            name="windowHours"
            required
            :description="`Hours, up to ${MAX_PRACTICE_WINDOW_HOURS}.`"
          >
            <UInputNumber
              v-model="state.windowHours"
              :min="1"
              :max="MAX_PRACTICE_WINDOW_HOURS"
              class="w-full"
              data-test="target-hours"
            />
          </UFormField>

          <UFormField
            label="Opened by"
            name="moduleIds"
            description="Being taught any of these opens a window on this surface."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="module in teachable"
                :key="module.id"
                size="sm"
                :color="state.moduleIds.includes(module.id) ? 'primary' : 'neutral'"
                :variant="state.moduleIds.includes(module.id) ? 'solid' : 'outline'"
                :aria-pressed="state.moduleIds.includes(module.id)"
                :data-test="`target-module-${module.id}`"
                @click="toggle(module.id)"
              >
                {{ module.id }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="In use"
            name="isActive"
          >
            <USwitch
              v-model="state.isActive"
              label="Teaching these modules opens a window"
              data-test="target-active"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="target-submit"
            >
              Save
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
  </div>
</template>
