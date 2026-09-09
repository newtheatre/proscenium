<script setup lang="ts">
import { can, manageSafety } from '#shared/utils/abilities'
import { closeFollowUpForm } from '#shared/utils/incident-safety'
import { saysCategory, saysSeverity, SEVERITIES } from '#shared/utils/incidents'
import { formatLondon } from '#shared/utils/london'
import type { Category, Severity } from '#shared/utils/incidents'

definePageMeta({ layout: 'console', title: 'Safety', middleware: 'console' })

interface SeverityRow { severity: Severity, requiresFollowUp: boolean }
interface OpenItem { id: string, performanceId: string, reportedByName: string, category: Category, severity: Severity, body: string, happenedAt: number }

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse (0040).
const writes = computed(() => can(useViewer().value, manageSafety))
const failure = ref<string | null>(null)
const saving = ref<Severity | null>(null)

const { data: severityData, status: severityStatus, refresh: refreshSeverities } = await useAsyncData(
  'safety-severities',
  () => request<{ severities: SeverityRow[] }>('/api/admin/safety/severities'),
  { default: (): { severities: SeverityRow[] } => ({ severities: [] }) },
)

const { data: openData, status: openStatus, refresh: refreshOpen } = await useAsyncData(
  'safety-open-items',
  () => request<{ items: OpenItem[] }>('/api/admin/safety/open-items'),
  { default: (): { items: OpenItem[] } => ({ items: [] }) },
)

const severities = computed(() => [...severityData.value.severities].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)))

async function toggle(row: SeverityRow, requiresFollowUp: boolean): Promise<void> {
  saving.value = row.severity
  failure.value = null
  try {
    await $fetch(`/api/admin/safety/severities/${row.severity}`, { method: 'PUT', body: { requiresFollowUp } })
    toast.add({ title: requiresFollowUp ? `${saysSeverity(row.severity)} now routes to follow-up` : `${saysSeverity(row.severity)} no longer routes`, icon: 'i-lucide-check', color: 'success' })
    await refreshSeverities()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = null
  }
}

function when(happenedAt: number): string {
  return formatLondon(new Date(happenedAt * 1000), { dateStyle: 'medium', timeStyle: 'short' })
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
      icon="i-lucide-shield-alert"
      title="Nothing routes until you opt it in"
      description="A severity with follow-up off notifies nobody when an incident is logged at it."
    />

    <UCard data-test="severity-config">
      <template #header>
        <h2 class="text-sm font-semibold">
          Severity routing
        </h2>
      </template>

      <div class="space-y-3">
        <div
          v-for="row in severities"
          :key="row.severity"
          class="flex items-center justify-between gap-4"
        >
          <span class="text-sm">{{ saysSeverity(row.severity) }}</span>
          <USwitch
            :model-value="row.requiresFollowUp"
            :disabled="writes === false"
            :loading="saving === row.severity"
            :data-test="`severity-toggle-${row.severity}`"
            @update:model-value="value => toggle(row, value)"
          />
        </div>
        <p
          v-if="severityStatus === 'pending'"
          class="text-sm text-muted"
        >
          Loading…
        </p>
      </div>
    </UCard>

    <UCard data-test="open-items">
      <template #header>
        <h2 class="text-sm font-semibold">
          Open follow-ups
        </h2>
      </template>

      <p
        v-if="openStatus !== 'pending' && openData.items.length === 0"
        class="py-6 text-center text-sm text-muted"
      >
        Nothing open.
      </p>

      <div
        v-else
        class="space-y-3"
      >
        <div
          v-for="item in openData.items"
          :key="item.id"
          class="flex flex-wrap items-start justify-between gap-2 border-b border-default pb-3 last:border-0 last:pb-0"
        >
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <UBadge
                color="error"
                variant="subtle"
                size="sm"
              >
                {{ saysSeverity(item.severity) }}
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ saysCategory(item.category) }}
              </UBadge>
              <span class="text-xs text-muted">{{ when(item.happenedAt) }} · {{ item.reportedByName }}</span>
            </div>
            <p class="text-sm">
              {{ item.body }}
            </p>
          </div>
          <UButton
            v-if="writes"
            size="sm"
            variant="subtle"
            :data-test="`close-item-${item.id}`"
            @click="startClose(item)"
          >
            Close
          </UButton>
        </div>
      </div>
    </UCard>

    <UModal
      v-model:open="open"
      title="Close a follow-up"
    >
      <template #body>
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
          Close it
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
