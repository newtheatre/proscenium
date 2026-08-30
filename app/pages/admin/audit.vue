<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { AUDIT_ACTIONS, AUDIT_ACTION_NAMES, AUDIT_MODULES, MANUAL_ACTION_NAMES, describeAction } from '#shared/utils/audit-actions'
import { formatLondon } from '#shared/utils/london'
import type { AuditActionName, AuditModule } from '#shared/utils/audit-actions'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Audit trail', middleware: 'signed-in' })

const UBadge = resolveComponent('UBadge')

interface Entry {
  id: string
  actorId: string | null
  actorName: string | null
  action: AuditActionName
  target: string | null
  detail: Record<string, unknown> | null
  createdAt: number
}

interface Listing {
  items: Entry[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const ANY = 'any'

const listing = ref<Listing | null>(null)
const module = ref<AuditModule | typeof ANY>(ANY)
const action = ref<AuditActionName | typeof ANY>(ANY)
const target = ref('')
const since = ref('')
const until = ref('')
const page = ref(1)
const loading = ref(false)
const failure = ref<string | null>(null)

const recording = ref(false)
const recorded = ref<string | null>(null)
const entry = reactive({ action: MANUAL_ACTION_NAMES[0]!, target: '', onBehalfOf: '', occurredOn: '' })

// A date on this screen is a London day, and the API wants the second it starts or ends (0014).
const startOf = (day: string): number | undefined =>
  day ? Math.floor(new Date(`${day}T00:00:00`).getTime() / 1000) : undefined
const endOf = (day: string): number | undefined =>
  day ? Math.floor(new Date(`${day}T23:59:59`).getTime() / 1000) : undefined

const filters = computed(() => ({
  module: module.value === ANY ? undefined : module.value,
  action: action.value === ANY ? undefined : action.value,
  target: target.value || undefined,
  from: startOf(since.value),
  to: endOf(until.value),
}))

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/audit', { query: { ...filters.value, page: page.value } })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function record(): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/audit', {
      method: 'POST',
      body: {
        action: entry.action,
        target: entry.target,
        onBehalfOf: entry.onBehalfOf,
        occurredAt: startOf(entry.occurredOn),
      },
    })
    recorded.value = describeAction(entry.action).label
    recording.value = false
    entry.target = ''
    entry.onBehalfOf = ''
    entry.occurredOn = ''
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

// The export carries the filter rather than the page, so what is saved is what was asked for.
const exportUrl = computed(() => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters.value)) {
    if (value !== undefined) query.set(key, String(value))
  }
  return `/api/admin/audit/export?${query.toString()}`
})

const MODULE_OPTIONS = [
  { label: 'Every module', value: ANY },
  ...AUDIT_MODULES.map(name => ({ label: name, value: name })),
]

// Narrowed to the chosen module, because an action filter offering every action in the estate is
// a list nobody reads.
const actionOptions = computed(() => [
  { label: 'Every action', value: ANY },
  ...AUDIT_ACTION_NAMES
    .filter(name => module.value === ANY || AUDIT_ACTIONS[name].module === module.value)
    .map(name => ({ label: AUDIT_ACTIONS[name].label, value: name })),
])

// Reset here rather than in a watcher: narrowing the list a select is rendering while that same
// select is open is what tears its content down mid-update.
function chooseModule(): void {
  if (module.value !== ANY && action.value !== ANY && AUDIT_ACTIONS[action.value].module !== module.value) {
    action.value = ANY
  }
}

watch([module, action, target, since, until], () => {
  page.value = 1
  void load()
})
watch(page, load)

const columns: TableColumn<Entry>[] = [
  {
    id: 'createdAt',
    header: 'When',
    cell: ({ row }) => formatLondon(new Date(row.original.createdAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }),
  },
  {
    id: 'actor',
    header: 'Who',
    // A system entry is structurally distinct (a null actor) and has to read that way too, or a
    // blank cell looks like missing data (J-101 criterion 2).
    cell: ({ row }) => row.original.actorId === null
      ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'System')
      : row.original.actorName ?? row.original.actorId,
  },
  {
    id: 'action',
    header: 'What',
    cell: ({ row }) => {
      const type = describeAction(row.original.action)
      return h('div', { class: 'flex items-center gap-2' }, [
        type.label,
        type.manual ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Recorded by hand') : null,
      ])
    },
  },
  { accessorKey: 'target', header: 'To what', meta: { class: { td: 'font-mono text-xs' } } },
  {
    id: 'detail',
    header: 'Detail',
    cell: ({ row }) => h('code', { class: 'text-xs' }, row.original.detail ? JSON.stringify(row.original.detail) : ''),
  },
]

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      v-if="recorded"
      data-test="audit-recorded"
      color="success"
      variant="subtle"
      :description="`${recorded} is on the trail, signed by you.`"
      close
      @update:open="recorded = null"
    />

    <div class="flex flex-wrap items-end gap-3">
      <UFormField
        label="Module"
        class="min-w-40"
      >
        <USelect
          v-model="module"
          data-test="audit-module"
          :items="MODULE_OPTIONS"
          value-key="value"
          @update:model-value="chooseModule"
        />
      </UFormField>

      <UFormField
        label="Action"
        class="min-w-56"
      >
        <USelect
          v-model="action"
          data-test="audit-action"
          :items="actionOptions"
          value-key="value"
        />
      </UFormField>

      <UFormField
        label="Target"
        class="min-w-56 flex-1"
      >
        <UInput
          v-model="target"
          data-test="audit-target"
          placeholder="user:0123456789abcdef"
          icon="i-lucide-search"
        />
      </UFormField>

      <UFormField label="From">
        <UInput
          v-model="since"
          data-test="audit-from"
          type="date"
        />
      </UFormField>

      <UFormField label="To">
        <UInput
          v-model="until"
          data-test="audit-to"
          type="date"
        />
      </UFormField>

      <UButton
        data-test="audit-record"
        icon="i-lucide-pen-line"
        @click="recording = true"
      >
        Record something
      </UButton>

      <UButton
        data-test="audit-export"
        icon="i-lucide-download"
        variant="subtle"
        :to="exportUrl"
        external
      >
        Export
      </UButton>
    </div>

    <UTable
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="audit-table"
    />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="audit-total"
        class="text-sm text-muted"
      >
        {{ listing?.total ?? 0 }} entr{{ listing?.total === 1 ? 'y' : 'ies' }}
      </p>
      <UPagination
        v-if="listing && listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      v-model:open="recording"
      title="Record something that happened outside the system"
      description="It is signed against you, and everybody named has to be an account here."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="record"
        >
          <UFormField label="What happened">
            <USelect
              v-model="entry.action"
              data-test="audit-entry-action"
              :items="MANUAL_ACTION_NAMES.map(name => ({ label: AUDIT_ACTIONS[name].label, value: name }))"
              value-key="value"
            />
          </UFormField>
          <UFormField
            label="Who it was about"
            description="The account id it happened to."
          >
            <UInput
              v-model="entry.target"
              data-test="audit-entry-target"
              required
            />
          </UFormField>
          <UFormField
            label="Who decided it"
            description="The account of the person whose decision this was, not yours."
          >
            <UInput
              v-model="entry.onBehalfOf"
              data-test="audit-entry-behalf"
              required
            />
          </UFormField>
          <UFormField
            label="When it happened"
            description="The real date, which is not the date this is being written down."
          >
            <UInput
              v-model="entry.occurredOn"
              data-test="audit-entry-date"
              type="date"
              required
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="audit-entry-submit"
          >
            Sign and record it
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
