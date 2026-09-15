<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { voidTabChargeForm } from '#shared/utils/tab-settlement'
import type { ItemisedTab, TabCharge } from '#shared/utils/tab-settlement'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Tabs', middleware: 'console', docs: '/docs/bar/tabs' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)

interface HolderRow { holderId: string, holderName: string, outstandingPence: number }

const { data, status, error, refresh } = await useAsyncData(
  'bar-tabs',
  () => request<{ ok: true, holders: HolderRow[] }>('/api/admin/bar/tabs').then(response => response.holders),
  { default: () => [] as HolderRow[] },
)

const listingFailure = useListFailure(error, 'The tab register could not be read.')

const viewing = ref<HolderRow | null>(null)
const tab = ref<ItemisedTab | null>(null)
const tabLoading = ref(false)
const voiding = ref<TabCharge | null>(null)
const voidReason = ref('')

async function view(holder: HolderRow): Promise<void> {
  viewing.value = holder
  tab.value = null
  failure.value = null
  tabLoading.value = true
  try {
    tab.value = (await $fetch<{ ok: true, tab: ItemisedTab }>(`/api/admin/bar/tabs/${holder.holderId}`)).tab
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    tabLoading.value = false
  }
}

function openVoid(charge: TabCharge): void {
  voiding.value = charge
  voidReason.value = ''
  failure.value = null
}

async function confirmVoid(): Promise<void> {
  const charge = voiding.value
  if (!charge) return

  const parsed = voidTabChargeForm.safeParse({ reason: voidReason.value })
  if (!parsed.success) {
    failure.value = parsed.error.issues[0]?.message ?? 'Say why'
    return
  }

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/tab-charges/${charge.entryId}/void`, { method: 'POST', body: parsed.data })
    toast.add({ title: 'Charge voided', icon: 'i-lucide-check', color: 'success' })
    voiding.value = null
    if (viewing.value) await view(viewing.value)
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// What a charge was for, read off its own lines rather than a total alone: a void names exactly
// what it is undoing.
function describe(charge: TabCharge): string {
  return charge.lines.map(line => `${line.qty}× ${line.variantLabel} ${line.productName}`).join(', ')
}

const columns: TableColumn<HolderRow>[] = [
  { id: 'holder', header: 'Holder', cell: ({ row }) => row.original.holderName },
  {
    id: 'outstanding',
    header: 'Outstanding',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => saysMoney(row.original.outstandingPence),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'data-test': `view-tab-${row.original.holderId}`,
      'onClick': () => view(row.original),
    }, () => 'View tab'),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure.message"
      :actions="listingFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listingFailure.enrolPath, color: 'error' }] : []"
    />

    <UAlert
      v-if="failure && !viewing"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-receipt"
      title="Every holder still carrying a balance"
      description="A charge to a tab is credit extended, not money taken: settlement clears it at the till, and a void here is the manager's own call, always with a reason on the record."
    />

    <AdminToolbar
      :searchable="false"
      :filterable="false"
      :loading="status === 'pending'"
    />

    <UTable
      :data="data"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-tabs-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No holder is carrying a balance.
        </p>
      </template>
    </UTable>

    <UModal
      :open="viewing !== null"
      :title="viewing ? `${viewing.holderName}'s tab` : ''"
      :description="viewing ? `Outstanding ${saysMoney(tab?.outstandingPence ?? viewing.outstandingPence)}` : ''"
      @update:open="viewing = null; tab = null; failure = null"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="tab-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />

        <p
          v-else-if="tabLoading"
          class="py-6 text-center text-sm text-muted"
        >
          Loading…
        </p>

        <ul
          v-else-if="tab && tab.charges.length > 0"
          class="space-y-3"
          data-test="tab-charges"
        >
          <li
            v-for="charge in tab.charges"
            :key="charge.entryId"
            class="flex items-start justify-between gap-3 border-b border-default pb-3 last:border-0"
            :data-test="`charge-${charge.entryId}`"
          >
            <div>
              <p class="text-sm">
                {{ describe(charge) }}
              </p>
              <p class="text-xs text-muted">
                {{ formatLondon(new Date(charge.happenedAt * 1000), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                · {{ saysMoney(charge.totalPence) }}
                <UBadge
                  v-if="charge.voided"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Voided
                </UBadge>
                <UBadge
                  v-else-if="charge.settledAt"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  Settled
                </UBadge>
              </p>
            </div>
            <UButton
              v-if="!charge.voided && !charge.settledAt"
              size="sm"
              color="error"
              variant="ghost"
              :data-test="`void-${charge.entryId}`"
              @click="openVoid(charge)"
            >
              Void
            </UButton>
          </li>
        </ul>

        <p
          v-else
          class="py-6 text-center text-sm text-muted"
        >
          No charges yet.
        </p>
      </template>

      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          @click="viewing = null"
        >
          Close
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="voiding !== null"
      title="Void this charge?"
      description="Written once and never edited: a void is a reversing credit, on the record with why."
      @update:open="voiding = null; failure = null"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="void-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <p
          v-if="voiding"
          class="mb-4 text-sm text-muted"
        >
          {{ describe(voiding) }}, {{ saysMoney(voiding.totalPence) }}.
        </p>
        <UFormField
          label="Reason"
          required
          description="Why this charge is being undone, on the audit record."
        >
          <UTextarea
            v-model="voidReason"
            :rows="2"
            class="w-full"
            data-test="void-reason"
          />
        </UFormField>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-void"
          @click="confirmVoid"
        >
          Void it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="voiding = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
