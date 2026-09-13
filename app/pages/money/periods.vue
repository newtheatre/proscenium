<script setup lang="ts">
import { can, closeFinancePeriods, reopenFinancePeriods } from '#shared/utils/abilities'
import { hasBlockingConditions } from '#shared/utils/period-locks'
import { formatLondon } from '#shared/utils/london'
import type { TableColumn } from '@nuxt/ui'
import type { BlockingConditions, PeriodLock } from '#shared/utils/period-locks'

definePageMeta({ layout: 'console', title: 'Periods', middleware: 'console' })

const columns: TableColumn<PeriodLock>[] = [
  { id: 'range', header: 'Range' },
  { id: 'label', header: 'Label' },
  { id: 'action', header: 'Action' },
  { id: 'actor', header: 'By' },
  { id: 'act', header: '' },
]

const request = useRequestFetch()
const toast = useToast()

const { data: locks, status: loading, error, refresh } = await useAsyncData(
  'period-locks',
  () => request<{ locks: PeriodLock[] }>('/api/admin/finance/periods').then(response => response.locks),
  { default: (): PeriodLock[] => [] },
)

const locksFailure = computed(() => (error.value ? refusalText(error.value, 'The close history could not be read.') : null))

// The list is newest first; the first row seen for a range is what governs it now, however many
// times that same range has been closed and reopened since (I-107 criterion 4).
const currentlyClosed = computed(() => {
  const seen = new Set<string>()
  const closed = new Set<string>()
  for (const lock of locks.value) {
    const key = `${lock.fromDay}:${lock.toDay}`
    if (seen.has(key)) continue
    seen.add(key)
    if (lock.action === 'CLOSED') closed.add(lock.id)
  }
  return closed
})

const mayClose = computed(() => can(useViewer().value, closeFinancePeriods))
const mayReopen = computed(() => can(useViewer().value, reopenFinancePeriods))

const closeOpen = ref(false)
const fromDay = ref('')
const toDay = ref('')
const label = ref('')
const preview = ref<BlockingConditions | null>(null)
const previewing = ref(false)
const closing = ref(false)
const closeFailure = ref<string | null>(null)

function openClose(): void {
  fromDay.value = ''
  toDay.value = ''
  label.value = ''
  preview.value = null
  closeFailure.value = null
  closeOpen.value = true
}

async function previewClose(): Promise<void> {
  previewing.value = true
  closeFailure.value = null
  try {
    preview.value = await $fetch<BlockingConditions>('/api/admin/finance/periods/preview', {
      method: 'POST',
      body: { fromDay: fromDay.value, toDay: toDay.value, label: label.value.trim() || undefined },
    })
  }
  catch (refused) {
    closeFailure.value = refusalText(refused)
  }
  finally {
    previewing.value = false
  }
}

async function confirmClose(): Promise<void> {
  closing.value = true
  closeFailure.value = null
  try {
    await $fetch('/api/admin/finance/periods', {
      method: 'POST',
      body: { fromDay: fromDay.value, toDay: toDay.value, label: label.value.trim() || undefined },
    })
    toast.add({ title: 'Period closed', description: `${fromDay.value} to ${toDay.value} is now closed.`, icon: 'i-lucide-lock', color: 'success' })
    closeOpen.value = false
    await refresh()
  }
  catch (refused) {
    closeFailure.value = refusalText(refused)
  }
  finally {
    closing.value = false
  }
}

const reopenTarget = ref<PeriodLock | null>(null)
const confirmFromDay = ref('')
const confirmToDay = ref('')
const reopening = ref(false)
const reopenFailure = ref<string | null>(null)

function openReopen(lock: PeriodLock): void {
  reopenTarget.value = lock
  confirmFromDay.value = ''
  confirmToDay.value = ''
  reopenFailure.value = null
}

const reopenMatches = computed(() =>
  Boolean(reopenTarget.value) && confirmFromDay.value === reopenTarget.value?.fromDay && confirmToDay.value === reopenTarget.value?.toDay)

async function confirmReopen(): Promise<void> {
  if (!reopenTarget.value) return
  reopening.value = true
  reopenFailure.value = null
  try {
    await $fetch(`/api/admin/finance/periods/${reopenTarget.value.id}/reopen`, {
      method: 'POST',
      body: { confirmFromDay: confirmFromDay.value, confirmToDay: confirmToDay.value },
    })
    toast.add({ title: 'Period reopened', description: `${reopenTarget.value.fromDay} to ${reopenTarget.value.toDay} is open again.`, icon: 'i-lucide-lock-open', color: 'success' })
    reopenTarget.value = null
    await refresh()
  }
  catch (refused) {
    reopenFailure.value = refusalText(refused)
  }
  finally {
    reopening.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="locksFailure"
      data-test="locks-failure"
      color="error"
      variant="subtle"
      :description="locksFailure"
    />

    <AdminToolbar :filterable="false">
      <template #actions>
        <UButton
          v-if="mayClose"
          data-test="open-close-period"
          icon="i-lucide-lock"
          @click="openClose"
        >
          Close a period
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="locks"
      :loading="loading === 'pending'"
      data-test="locks-table"
      :columns="columns"
    >
      <template #range-cell="{ row }">
        {{ row.original.fromDay }} to {{ row.original.toDay }}
      </template>
      <template #label-cell="{ row }">
        {{ row.original.label ?? 'None' }}
      </template>
      <template #action-cell="{ row }">
        <UBadge
          :color="row.original.action === 'CLOSED' ? 'warning' : 'neutral'"
          variant="subtle"
        >
          {{ row.original.action === 'CLOSED' ? 'Closed' : 'Reopened' }}
        </UBadge>
      </template>
      <template #actor-cell="{ row }">
        {{ row.original.actorName }}, {{ formatLondon(new Date(row.original.createdAt * 1000), { dateStyle: 'short', timeStyle: 'short' }) }}
      </template>
      <template #act-cell="{ row }">
        <UButton
          v-if="mayReopen && row.original.action === 'CLOSED' && currentlyClosed.has(row.original.id)"
          size="sm"
          variant="subtle"
          color="neutral"
          :data-test="`reopen-${row.original.id}`"
          @click="openReopen(row.original)"
        >
          Reopen
        </UButton>
      </template>
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No period has ever been closed.
        </p>
      </template>
    </UTable>

    <UModal
      v-model:open="closeOpen"
      title="Close a period"
      description="New ledger entries dated inside the range are refused until it is reopened; a correction posts in the open period instead."
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="closeFailure"
            data-test="close-failure"
            color="error"
            variant="subtle"
            :description="closeFailure"
          />

          <UFormField label="From">
            <DateField
              v-model="fromDay"
              data-test="close-from"
            />
          </UFormField>
          <UFormField label="To">
            <DateField
              v-model="toDay"
              data-test="close-to"
            />
          </UFormField>
          <UFormField
            label="Label"
            description="Optional, such as a term name."
          >
            <UInput
              v-model="label"
              class="w-full"
              data-test="close-label"
            />
          </UFormField>

          <template v-if="preview">
            <UAlert
              v-if="hasBlockingConditions(preview)"
              data-test="close-blocking"
              color="warning"
              variant="subtle"
              title="This range has open items"
              :description="`${plural(preview.unreconciledNights.length, 'night')} with no recorded Z reading and ${plural(preview.openVarianceNights.length, 'night')} with an open variance. Closing does not resolve them; it only stops new entries landing inside the range.`"
            />
            <UAlert
              v-else
              data-test="close-clear"
              color="success"
              variant="subtle"
              description="No unreconciled nights or open variances in this range."
            />

            <div class="flex gap-2">
              <UButton
                data-test="confirm-close"
                color="error"
                variant="subtle"
                :loading="closing"
                :disabled="!fromDay || !toDay"
                @click="confirmClose"
              >
                Close this period
              </UButton>
              <UButton
                variant="ghost"
                @click="preview = null"
              >
                Back
              </UButton>
            </div>
          </template>

          <UButton
            v-else
            data-test="preview-close"
            variant="subtle"
            :loading="previewing"
            :disabled="!fromDay || !toDay"
            @click="previewClose"
          >
            Preview what this warns about
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="Boolean(reopenTarget)"
      title="Reopen this period"
      description="Requires an administrator. Type the range back to confirm you are reopening what the row above shows, not a stale read."
      @update:open="(open: boolean) => { if (!open) reopenTarget = null }"
    >
      <template #body>
        <div
          v-if="reopenTarget"
          class="space-y-4"
        >
          <UAlert
            v-if="reopenFailure"
            data-test="reopen-failure"
            color="error"
            variant="subtle"
            :description="reopenFailure"
          />
          <p class="text-sm">
            Reopening <span class="font-medium">{{ reopenTarget.fromDay }} to {{ reopenTarget.toDay }}</span>.
            Nothing else here is undone.
          </p>
          <UFormField :label="`Type ${reopenTarget.fromDay} to confirm the start`">
            <DateField
              v-model="confirmFromDay"
              data-test="confirm-from"
            />
          </UFormField>
          <UFormField :label="`Type ${reopenTarget.toDay} to confirm the end`">
            <DateField
              v-model="confirmToDay"
              data-test="confirm-to"
            />
          </UFormField>
          <div class="flex gap-2">
            <UButton
              data-test="confirm-reopen"
              color="error"
              variant="subtle"
              :loading="reopening"
              :disabled="!reopenMatches"
              @click="confirmReopen"
            >
              Reopen the period
            </UButton>
            <UButton
              variant="ghost"
              @click="reopenTarget = null"
            >
              Cancel
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
