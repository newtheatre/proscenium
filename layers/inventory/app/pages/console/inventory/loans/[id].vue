<!-- One loan (S5; wireframe 2): who has it, its window and its lines, each saying whether its item is
     free then, as approval will ask. Approval promises every listed line or none (L7); a line in the
     way is named and can be taken off. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { LoanDetail, LoanLine } from '../../../../../shared/loans'

const { t } = useT()
const { range } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ loan: LoanDetail }>(() => `/api/inventory/loans/${encodeURIComponent(id.value)}`, { key: `inventory:loan:${id.value}` })
const loan = computed(() => data.value?.loan)
const { refusal, approve, decline, cancel, addLine, removeLine, open, primary } = useLoanPage(loan, refresh)
const declining = ref(false)
const note = ref('')
const wanted = ref('')

const TONE = { draft: 'neutral', requested: 'warning', approved: 'info', out: 'info', returned: 'success', declined: 'neutral', cancelled: 'neutral' } as const
const actions = computed((): DropdownMenuItem[][] => {
  const l = loan.value
  if (!l?.can.approve) return []
  return [
    l.state === 'requested' ? [{ label: t('inventory.loan.decline'), icon: 'i-lucide-x', onSelect: () => { declining.value = true } }] : [],
    ['draft', 'requested', 'approved'].includes(l.state) ? [{ label: t('inventory.loan.cancel'), icon: 'i-lucide-ban', color: 'error' as const, onSelect: () => { void cancel() } }] : [],
  ].filter(g => g.length)
})
const summary = computed(() => {
  const l = loan.value
  if (!l) return []
  return [
    { label: t('inventory.item.department'), value: l.department },
    { label: t('inventory.loan.window'), value: range(l.startsAt, l.dueBackOn) },
    { label: t('inventory.loan.kind'), value: t(`inventory.loan-kinds.${l.kind}`) },
    { label: t('inventory.loan.lines'), value: String(l.lines) },
  ]
})
const freeBadge = (line: LoanLine) => !line.free
  ? null
  : line.free.free
    ? { tone: 'success' as const, label: t('inventory.loan.free') }
    : { tone: 'danger' as const, label: t(`inventory.loan.unfree.${line.free.reason}`) }
const lineName = (line: LoanLine) => line.tag ? `${line.tag} · ${line.name}` : (line.wanted ?? '')
const removable = (line: LoanLine) => !!loan.value?.can.edit && !line.withLineId && ['wanted', 'listed', 'promised'].includes(line.state) && loan.value.state !== 'out'
async function sendDecline() {
  if (await decline(note.value)) declining.value = false
}
async function addWanted() {
  if (wanted.value.trim() && await addLine({ wanted: wanted.value.trim() })) wanted.value = ''
}
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="d.loan.borrower || t('inventory.loans.no-borrower')"
        :status="{ label: t(`inventory.loan-states.${d.loan.state}`), tone: TONE[d.loan.state] }"
        :primary="primary"
        :actions="actions"
        :summary="summary"
        record-type="inventory.loan"
        :record-id="d.loan.id"
        :tabs="[{ id: 'lines', label: t('inventory.loan.lines') }]"
        :trail="[{ label: t('inventory.navigation.loans.label'), to: '/console/inventory/loans' }]"
        @primary="approve()"
      >
        <template #tab-lines>
          <div class="max-w-3xl space-y-4">
            <RefusalNotice :refusal="refusal" />
            <p
              v-if="d.loan.purpose"
              class="text-sm"
            >
              {{ d.loan.purpose }}
            </p>
            <UAlert
              v-if="d.loan.declineNote"
              color="neutral"
              variant="subtle"
              :title="t('inventory.loan.decline-note')"
              :description="d.loan.declineNote"
            />
            <EmptyState
              v-if="!d.loan.lineList.length"
              icon="i-lucide-list"
              :title="t('inventory.loan.no-lines')"
            />
            <RecordList
              v-else
              :label="t('inventory.loan.lines')"
            >
              <RecordListItem
                v-for="line in d.loan.lineList"
                :key="line.id"
                :to="line.itemId ? `/console/inventory/items/${line.itemId}` : undefined"
                :icon="line.itemId ? 'i-lucide-package' : 'i-lucide-message-square-text'"
                :name="lineName(line)"
                :description="t(`inventory.line-states.${line.state}`)"
                :muted="line.state === 'cancelled'"
              >
                <StatusBadge
                  v-if="freeBadge(line)"
                  :tone="freeBadge(line)!.tone"
                  :label="freeBadge(line)!.label"
                />
                <template
                  v-if="removable(line)"
                  #trailing
                >
                  <RowActions
                    :items="[{ label: t('inventory.loan.remove-line'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeLine(line) } }]"
                    :label="t('inventory.loan.actions-for', { name: lineName(line) })"
                  />
                </template>
              </RecordListItem>
            </RecordList>
            <UForm
              v-if="open && d.loan.can.edit"
              class="flex flex-wrap items-end gap-2"
              :state="{ wanted }"
              :validate="() => needs({ wanted: wanted.trim() })"
              novalidate
              @submit="addWanted"
            >
              <UFormField
                name="wanted"
                :label="t('inventory.loan.add-wanted')"
              >
                <UInput
                  v-model="wanted"
                  maxlength="200"
                  class="min-w-72"
                />
              </UFormField>
              <UButton
                type="submit"
                color="neutral"
                variant="outline"
                :label="t('inventory.loan.add')"
              />
            </UForm>
          </div>
        </template>
      </PageRecord>
      <UModal
        v-model:open="declining"
        :title="t('inventory.loan.decline')"
      >
        <template #body>
          <UFormField
            :label="t('inventory.loan.decline-note')"
            :help="t('inventory.loan.decline-help')"
          >
            <UTextarea
              v-model="note"
              maxlength="500"
              :rows="3"
            />
          </UFormField>
        </template>
        <template #footer>
          <UButton
            color="error"
            :label="t('inventory.loan.decline')"
            @click="sendDecline"
          />
        </template>
      </UModal>
    </template>
  </DataBoundary>
</template>
