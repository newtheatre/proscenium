<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { AUDIT_ACTIONS, MANUAL_ACTION_NAMES, describeAction } from '#shared/utils/audit-actions'
import { auditList } from '#shared/utils/audit-list'
import { saysDay, saysWhen } from '#shared/utils/when'
import { manualEntryForm } from '#shared/utils/admin-forms'
import type { ManualEntryForm } from '#shared/utils/admin-forms'
import type { AuditActionName } from '#shared/utils/audit-actions'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Audit trail', middleware: 'console', docs: '/docs/system/audit-trail' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Entry {
  id: string
  actorId: string | null
  actorName: string | null
  action: AuditActionName
  target: string | null
  targetName: string | null
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

// Search, every declared filter, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, set, setSort, clear } = useListQuery(auditList)

const listing = ref<Listing | null>(null)
const loading = ref(false)
const failure = ref<ListFailure | null>(null)

// A wide diff wrapped one row to several times its neighbours' height (issue 935); past this many
// badges the rest sit in the row's own expanded detail instead.
const SUMMARY_BADGE_LIMIT = 3
const expanded = ref<Record<string, boolean>>({})

const toast = useToast()
const entryForm = useTemplateRef('entryForm')

const recording = ref(false)
const entry = reactive<Partial<ManualEntryForm>>({
  action: MANUAL_ACTION_NAMES[0]!,
})

// A date on this screen is a London day, and the API wants the second it starts or ends (0014).
const startOf = (day: string): number | undefined =>
  day ? Math.floor(new Date(`${day}T00:00:00`).getTime() / 1000) : undefined

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/audit', { query: query.value })
  }
  catch (error) {
    failure.value = listFailureFrom(error)
  }
  finally {
    loading.value = false
  }
}

// A manual entry is a signed record, so a stale session re-asserts in the modal rather than
// losing the form (A-128 criterion 3).
const reauthenticating = ref(false)
const pendingEntry = ref<FormSubmitEvent<ManualEntryForm> | null>(null)

function retryAfterReauthentication(): void {
  const pending = pendingEntry.value
  pendingEntry.value = null
  if (pending) void record(pending)
}

useReauthenticateReturn()

async function record(event: FormSubmitEvent<ManualEntryForm>): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/audit', {
      method: 'POST',
      body: { ...event.data, occurredAt: startOf(event.data.occurredOn) },
    })
    toast.add({
      title: `${describeAction(entry.action ?? '').label} is on the trail`,
      description: 'Signed by you.',
      icon: 'i-lucide-pen-line',
      color: 'success',
    })
    recording.value = false
    entry.target = undefined
    entry.onBehalfOf = undefined
    entry.occurredOn = undefined
    await load()
  }
  catch (error) {
    if (needsReauthentication(error)) {
      pendingEntry.value = event
      reauthenticating.value = true
      return
    }
    const message = refusalText(error)
    if (/subject/i.test(message)) entryForm.value?.setErrors([{ name: 'target', message }])
    else if (/recorded for/i.test(message)) entryForm.value?.setErrors([{ name: 'onBehalfOf', message }])
    else if (/has not happened/i.test(message)) entryForm.value?.setErrors([{ name: 'occurredOn', message }])
    else failure.value = { message, enrolPath: enrolPath(error) }
  }
}

// The export carries the same declared query rather than the page, so what is saved is what
// was asked for.
const exportUrl = computed(() => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query.value)) params.set(key, String(value))
  return `/api/admin/audit/export?${params.toString()}`
})

watch(query, load)

// Raw JSON ran off the edge of the table and told nobody anything. A diff has a shape (0027), so
// it reads as one; everything else reads as its own keys and values.
function describeDetail(detail: Record<string, unknown> | null): string[] {
  if (!detail) return []
  const parts: string[] = []
  const changes = detail.changes as Record<string, { from: unknown, to: unknown }> | undefined
  for (const [field, change] of Object.entries(changes ?? {})) {
    parts.push(`${field}: ${readable(field, change.from)} \u2192 ${readable(field, change.to)}`)
  }
  for (const [key, value] of Object.entries(detail)) {
    if (key === 'changes') continue
    parts.push(`${key}: ${readable(key, value)}`)
  }
  return parts
}

// A key ending in At holds epoch seconds, which reads as a nine digit number unless it is turned
// back into the date it is (0014).
function readable(key: string, value: unknown): string {
  if (key.endsWith('At') && typeof value === 'number' && Number.isInteger(value)) {
    return saysDay(value)
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const columns: TableColumn<Entry>[] = [
  {
    id: 'expand',
    cell: ({ row }) => describeDetail(row.original.detail).length <= SUMMARY_BADGE_LIMIT
      ? null
      : h(UButton, {
          'color': 'neutral',
          'variant': 'ghost',
          'icon': 'i-lucide-chevron-down',
          'square': true,
          'size': 'xs',
          'aria-label': 'Show the full diff',
          'data-test': `audit-expand-${row.original.id}`,
          'ui': { leadingIcon: ['transition-transform', row.getIsExpanded() ? 'duration-200 rotate-180' : ''] },
          'onClick': () => row.toggleExpanded(),
        }),
  },
  {
    id: 'createdAt',
    header: 'When',
    cell: ({ row }) => saysWhen(row.original.createdAt),
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
  {
    id: 'target',
    header: 'To whom',
    // A name where there is one, and the raw target where the entry is not about a person.
    cell: ({ row }) => row.original.targetName
      ?? h('span', { class: 'font-mono text-xs text-muted' }, row.original.target ?? ''),
  },
  {
    id: 'detail',
    header: 'What changed',
    cell: ({ row }) => {
      const parts = describeDetail(row.original.detail)
      const shown = parts.slice(0, SUMMARY_BADGE_LIMIT)
      const remaining = parts.length - shown.length
      return h('div', { class: 'flex flex-wrap gap-1' }, [
        ...shown.map(part => h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm', class: 'font-mono' }, () => part)),
        remaining > 0 ? h(UBadge, { color: 'neutral', variant: 'soft', size: 'sm' }, () => `+${remaining} more`) : null,
      ])
    },
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
      :description="failure.message"
      :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
    />

    <AdminToolbar
      v-model:search="search"
      :placeholder="auditList.search?.placeholder"
      :active="active"
      :loading="loading"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="auditList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
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
          color="neutral"
          variant="outline"
          :to="exportUrl"
          external
        >
          Export
        </UButton>
      </template>
    </AdminToolbar>

    <!-- A wide read-only history table forces horizontal scroll below sm (922); one card per
         row there instead, the table above it. -->
    <UTable
      v-model:expanded="expanded"
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="audit-table"
      class="hidden sm:block"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ active.length
            ? 'No entry matches that.'
            : 'Nothing on the trail yet. Every privileged action lands here.' }}
        </p>
      </template>

      <template #expanded="{ row }">
        <div
          class="flex flex-wrap gap-1 p-2"
          data-test="audit-detail-full"
        >
          <UBadge
            v-for="part in describeDetail(row.original.detail)"
            :key="part"
            color="neutral"
            variant="subtle"
            size="sm"
            class="font-mono"
          >
            {{ part }}
          </UBadge>
        </div>
      </template>
    </UTable>
    <p
      v-if="(listing?.items.length ?? 0) === 0"
      class="sm:hidden py-6 text-center text-sm text-muted"
    >
      {{ active.length
        ? 'No entry matches that.'
        : 'Nothing on the trail yet. Every privileged action lands here.' }}
    </p>
    <ul
      v-else
      class="sm:hidden space-y-3"
      data-test="audit-cards"
    >
      <li
        v-for="logEntry in listing?.items ?? []"
        :key="logEntry.id"
        class="rounded-lg border border-default p-3 text-sm"
      >
        <div class="flex items-center justify-between gap-2 text-xs text-muted">
          <span>{{ saysWhen(logEntry.createdAt) }}</span>
          <span v-if="logEntry.actorId === null">System</span>
          <span v-else>{{ logEntry.actorName ?? logEntry.actorId }}</span>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span>{{ describeAction(logEntry.action).label }}</span>
          <UBadge
            v-if="describeAction(logEntry.action).manual"
            color="warning"
            variant="subtle"
            size="sm"
          >
            Recorded by hand
          </UBadge>
        </div>
        <p
          v-if="logEntry.targetName ?? logEntry.target"
          class="text-muted"
        >
          {{ logEntry.targetName ?? logEntry.target }}
        </p>
        <div
          v-if="describeDetail(logEntry.detail).length"
          class="mt-1 flex flex-wrap gap-1"
        >
          <UBadge
            v-for="part in describeDetail(logEntry.detail)"
            :key="part"
            color="neutral"
            variant="subtle"
            size="sm"
            class="font-mono"
          >
            {{ part }}
          </UBadge>
        </div>
      </li>
    </ul>

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
        <UForm
          ref="entryForm"
          :schema="manualEntryForm"
          :state="entry"
          class="space-y-4"
          @submit="record"
        >
          <UFormField
            name="action"
            label="What happened"
            required
          >
            <USelect
              v-model="entry.action"
              data-test="audit-entry-action"
              :items="MANUAL_ACTION_NAMES.map(name => ({ label: AUDIT_ACTIONS[name].label, value: name }))"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="target"
            label="Who it was about"
            required
          >
            <PersonPicker
              v-model="entry.target"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="onBehalfOf"
            label="Who decided it"
            description="Whose decision this was, not yours. You are the signature."
            required
          >
            <PersonPicker
              v-model="entry.onBehalfOf"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="occurredOn"
            label="When it happened"
            description="The real date, which is not the date this is being written down."
            required
          >
            <DateField
              v-model="entry.occurredOn"
              data-test="audit-entry-date"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="audit-entry-submit"
          >
            Sign and record it
          </UButton>
        </UForm>
      </template>
    </UModal>

    <ReauthenticateModal
      v-model:open="reauthenticating"
      @reauthenticated="retryAfterReauthentication"
    />
  </div>
</template>
