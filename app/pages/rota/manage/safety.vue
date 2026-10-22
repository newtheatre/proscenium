<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageSafety } from '#shared/utils/abilities'
import { closeFollowUpForm, saysEarlierFollowUps } from '#shared/utils/incident-safety'
import { saysCategory, saysSeverity, SEVERITIES } from '#shared/utils/incidents'
import { saysWhen } from '#shared/utils/when'
import type { Category, Severity } from '#shared/utils/incidents'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Safety', middleware: 'console', docs: '/docs/rota/safety' })

interface SeverityRow { severity: Severity, requiresFollowUp: boolean }
interface OpenItem { id: string, performanceId: string, reportedByName: string, category: Category, severity: Severity, body: string, happenedAt: number }

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse (0040).
const writes = computed(() => can(useViewer().value, manageSafety))
const failure = ref<string | null>(null)
const saving = ref<Severity | null>(null)

const { data: severityData, status: severityStatus, refresh: refreshSeverities, error: severityError } = await useAsyncData(
  'safety-severities',
  () => request<{ severities: SeverityRow[] }>('/api/admin/safety/severities'),
  { default: (): { severities: SeverityRow[] } => ({ severities: [] }) },
)

const { data: openData, status: openStatus, refresh: refreshOpen, error: openError } = await useAsyncData(
  'safety-open-items',
  () => request<{ items: OpenItem[] }>('/api/admin/safety/open-items'),
  { default: (): { items: OpenItem[] } => ({ items: [] }) },
)

// Every severity ships routing nowhere, so a fresh install tells nobody about anything (E-116).
const routesNowhere = computed(() => severityStatus.value === 'success' && severityData.value.severities.length > 0
  && severityData.value.severities.every(row => !row.requiresFollowUp))

const severityFailure = useListFailure(severityError, 'The severity routing could not be read.')
const openFailure = useListFailure(openError, 'The open items could not be read.')
const readFailure = computed(() => severityFailure.value ?? openFailure.value)

async function reread(): Promise<void> {
  await Promise.all([refreshSeverities(), refreshOpen()])
}

const severities = computed(() => [...severityData.value.severities].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)))

async function toggle(row: SeverityRow, requiresFollowUp: boolean): Promise<void> {
  saving.value = row.severity
  failure.value = null
  try {
    const { waiting } = await $fetch<{ waiting: number }>(`/api/admin/safety/severities/${row.severity}`, { method: 'PUT', body: { requiresFollowUp } })
    toast.add({
      title: requiresFollowUp ? `${saysSeverity(row.severity)} now routes to follow-up` : `${saysSeverity(row.severity)} no longer routes`,
      description: saysEarlierFollowUps(waiting),
      icon: 'i-lucide-check',
      color: 'success',
    })
    await reread()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = null
  }
}

function when(happenedAt: number): string {
  return saysWhen(happenedAt)
}

const closing = ref<OpenItem | null>(null)
const open = ref(false)
const resolutionNote = ref('')
const closeSaving = ref(false)

function startClose(item: OpenItem): void {
  closing.value = item
  resolutionNote.value = ''
  failure.value = null
  open.value = true
}

const refusal = computed(() => (closeFollowUpForm.safeParse({ resolutionNote: resolutionNote.value }).success ? null : 'Give a resolution note'))

async function close(): Promise<void> {
  if (!closing.value) return
  closeSaving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/safety/incidents/${closing.value.id}/close`, { method: 'POST', body: { resolutionNote: resolutionNote.value } })
    toast.add({ title: 'Follow-up closed', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await refreshOpen()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    closeSaving.value = false
  }
}

const USwitch = resolveComponent('USwitch')
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const severityColumns: TableColumn<SeverityRow>[] = [
  { id: 'severity', header: 'Severity', cell: ({ row }) => h('span', { class: 'text-sm' }, saysSeverity(row.original.severity)) },
  {
    id: 'routing',
    header: 'Routes to follow-up',
    cell: ({ row }) => h(USwitch, {
      'modelValue': row.original.requiresFollowUp,
      'disabled': writes.value === false,
      'loading': saving.value === row.original.severity,
      'aria-label': `${saysSeverity(row.original.severity)} routes to follow-up`,
      'data-test': `severity-toggle-${row.original.severity}`,
      'onUpdate:modelValue': (value: boolean) => toggle(row.original, value),
    }),
  },
]

const openColumns = computed<TableColumn<OpenItem>[]>(() => [
  {
    id: 'incident',
    header: 'Incident',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('div', { class: 'flex items-center gap-2' }, [
        h(UBadge, { color: 'error', variant: 'subtle', size: 'sm' }, () => saysSeverity(row.original.severity)),
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysCategory(row.original.category)),
      ]),
      h('p', { class: 'text-sm' }, row.original.body),
      // Below sm the when and the reporter are hidden: shown here instead, so a phone keeps the
      // row's action in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${when(row.original.happenedAt)} · ${row.original.reportedByName}`),
    ]),
  },
  { id: 'when', header: 'When', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap text-xs text-muted` } }, cell: ({ row }) => when(row.original.happenedAt) },
  { id: 'by', header: 'Reported by', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-xs text-muted` } }, cell: ({ row }) => row.original.reportedByName },
  ...(writes.value
    ? [{
        id: 'act',
        header: ACTIONS_HEADER,
        meta: ACTIONS_COLUMN,
        cell: ({ row }: { row: { original: OpenItem } }) => h(UButton, {
          'size': 'sm',
          'variant': 'subtle',
          'data-test': `close-item-${row.original.id}`,
          'onClick': () => startClose(row.original),
        }, () => 'Close'),
      }]
    : []),
])

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => open.value)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <ReadGate
    :failure="readFailure"
    class="space-y-6"
    @retry="reread"
  >
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      Who hears about an incident, by how serious it is.
    </p>

    <UAlert
      v-if="routesNowhere"
      data-test="routing-off"
      color="warning"
      variant="subtle"
      icon="i-lucide-siren"
      title="No severity routes to follow-up"
      :description="`An incident logged at any severity, ${saysSeverity('SERIOUS').toLowerCase()} included, reaches nobody and joins no open list. Switch on the severities that need following up.`"
    />

    <UCard data-test="severity-config">
      <template #header>
        <h2 class="text-sm font-semibold">
          Severity routing
        </h2>
      </template>

      <UTable
        :data="severities"
        :columns="severityColumns"
        :loading="severityStatus === 'pending'"
        data-test="severity-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            No severities to route yet.
          </p>
        </template>
      </UTable>
    </UCard>

    <UCard data-test="open-items">
      <template #header>
        <h2 class="text-sm font-semibold">
          Open follow-ups
        </h2>
      </template>

      <UTable
        :data="openData.items"
        :columns="openColumns"
        :loading="openStatus === 'pending'"
        data-test="open-items-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            Nothing open. An incident logged at a severity that routes appears here.
          </p>
        </template>
      </UTable>
    </UCard>

    <UModal
      v-model:open="open"
      title="Close a follow-up"
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
          <p
            v-if="closing"
            class="text-sm text-muted"
          >
            {{ closing.body }}
          </p>
          <UFormField label="Resolution note">
            <UTextarea
              v-model="resolutionNote"
              class="w-full"
              data-test="resolution-note"
            />
          </UFormField>
          <UAlert
            v-if="refusal"
            color="warning"
            variant="subtle"
            data-test="close-refusal"
            :description="refusal"
          />
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="closeSaving"
          :disabled="refusal !== null"
          data-test="close-submit"
          @click="close"
        >
          Close the follow-up
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
  </ReadGate>
</template>
