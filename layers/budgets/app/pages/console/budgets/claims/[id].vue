<!-- Reviewing a claim (BC-21 to BC-26, wireframe C): each item beside its receipts, its line and
     category confirmed and the amount approved, less with a reason. Over budget the button says by how
     much and only the treasurer has it; a holder sees who it needs. Above the second-approval amount
     the treasurer, someone else, approves again. Sending back and declining ask for a note the
     claimant reads; the treasurer voids an approved, unpaid claim with one. -->
<script setup lang="ts">
import type { ClaimItem } from '../../../../composables/useClaim'

interface OfferedLine { id: string, name: string, budgetId: string, budgetName: string, currency: string }
interface Category { id: string, name: string, description: string }
type NoteKind = 'return' | 'decline' | 'void'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { day } = useDates()
const text = useBudgetText()
const { data, status, error, refresh, act, title } = await useClaim(id)
const { data: choices } = await useAPI<{ lines: OfferedLine[], categories: Category[] }>('/api/budgets/claims/choices', { key: 'budgets:claim-choices' })

const yours = computed(() => new Set(data.value?.review?.yours ?? []))
const deciding = computed(() => data.value?.claim.state === 'submitted' && yours.value.size > 0)
// C4: every item is decided and the treasurer, not the first approver, approves the claim again.
const second = computed(() => !!data.value?.review?.mayApproveSecond)
const awaitingSecond = computed(() => !!data.value?.review?.awaitingSecond)
const mayDecide = computed(() => deciding.value || second.value)
const decisions = reactive<Record<string, { lineId?: string, categoryId?: string, approvedMinor: number | null, partReason: string }>>({})
watch(data, (now) => {
  for (const i of now?.items ?? []) if (yours.value.has(i.id)) decisions[i.id] = { lineId: i.lineId ?? undefined, categoryId: i.categoryId ?? undefined, approvedMinor: i.amountMinor, partReason: '' }
}, { immediate: true })
const late = computed(() => new Set(data.value?.review?.marks.lateItems ?? []))
const over = computed(() => data.value?.review?.overMinor ?? 0)
const mayApprove = computed(() => !over.value || !!data.value?.review?.any)
const lineItems = computed(() => (choices.value?.lines ?? []).map(l => ({ value: l.id, label: l.name, description: l.budgetName })))
const categoryItems = computed(() => (choices.value?.categories ?? []).map(c => ({ value: c.id, label: c.name })))
const money = (minor: number) => text.money(minor, data.value?.claim.currency ?? 'GBP')

function describe(i: ClaimItem) {
  return [i.description, i.supplier, day(i.spentOn), i.lineName ? `${i.budgetName}: ${i.lineName}` : null, i.noReceiptReason ? t('budgets.screens.claims.no-receipt-because', { reason: i.noReceiptReason }) : null].filter(Boolean).join(' · ')
}
async function approve() {
  if (second.value) return act('/approve', { version: data.value!.claim.version, items: [] }, 'budgets.screens.claims.approved')
  const items = Object.entries(decisions).map(([itemId, d]) => ({ id: itemId, lineId: d.lineId, categoryId: d.categoryId ?? null, approvedMinor: d.approvedMinor ?? 0, partReason: d.partReason.trim() || null }))
  await act('/approve', { version: data.value!.claim.version, items }, 'budgets.screens.claims.approved')
}
const approveLabel = computed(() => second.value ? t('budgets.screens.claims.approve-second') : over.value ? t('budgets.screens.approvals.approve-over', { amount: money(over.value) }) : t('budgets.screens.approvals.approve'))

// Sending back, declining and voiding, each with a note.
const noting = ref<NoteKind | null>(null)
const note = ref('')
function openNote(kind: NoteKind) {
  note.value = ''
  noting.value = kind
}
async function sendNote() {
  const kind = noting.value!
  if (await act(`/${kind}`, { version: data.value!.claim.version, note: note.value.trim() }, `budgets.screens.claims.done-${kind}`)) noting.value = null
}
const actions = computed(() => [
  ...((deciding.value && mayApprove.value) || second.value ? [{ label: approveLabel.value, icon: 'i-lucide-check', onSelect: approve }] : []),
  ...(mayDecide.value ? [{ label: t('budgets.screens.claims.return'), icon: 'i-lucide-undo-2', onSelect: () => openNote('return') }] : []),
])
const menu = computed(() => [
  ...(mayDecide.value ? [{ label: t('budgets.screens.claims.decline'), icon: 'i-lucide-x', onSelect: () => openNote('decline') }] : []),
  ...(data.value?.canVoid ? [{ label: t('budgets.screens.claims.void'), icon: 'i-lucide-ban', onSelect: () => openNote('void') }] : []),
])
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('budgets.navigation.budgets.label'), to: '/console/budgets' }, { label: t('budgets.navigation.approvals.label'), to: '/console/budgets/approvals' }]"
  >
    <template #primary>
      <PageActions
        :actions="actions"
        :menu="menu"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <FactStrip
          :facts="[
            { label: t('budgets.screens.claims.state'), value: text.claimState(data.claim.state).label },
            { label: t('budgets.screens.claims.claimant'), value: data.claim.claimant ?? t('budgets.screens.claims.no-claimant') },
            { label: t('budgets.screens.claims.total'), value: money(data.claim.totalMinor) },
            ...(data.claim.approvedMinor !== null ? [{ label: t('budgets.screens.claims.approved-total'), value: money(data.claim.approvedMinor) }] : []),
          ]"
        />
        <UAlert
          v-if="deciding && over && !mayApprove"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('budgets.screens.approvals.needs-treasurer', { amount: money(over) })"
        />
        <UAlert
          v-if="awaitingSecond"
          color="neutral"
          variant="subtle"
          icon="i-lucide-users"
          :title="t(second ? 'budgets.screens.claims.second-yours' : 'budgets.screens.claims.second-waiting')"
        />
        <UAlert
          v-if="data.review?.marks.notAskedFirst"
          color="neutral"
          variant="subtle"
          icon="i-lucide-message-circle-question"
          :title="t('budgets.screens.claims.not-asked-first')"
        />
        <PageSection :title="t('budgets.screens.claims.items')">
          <RecordList :label="t('budgets.screens.claims.items')">
            <RecordListItem
              v-for="i in data.items"
              :key="i.id"
              icon="i-lucide-shopping-bag"
              :name="money(i.amountMinor)"
              :description="describe(i)"
              align="start"
            >
              <template #below>
                <div class="space-y-3">
                  <StatusBadge
                    v-if="late.has(i.id)"
                    tone="warning"
                    :label="t('budgets.screens.claims.late')"
                  />
                  <BudgetsClaimReceipts
                    :claim-id="data.claim.id"
                    :item="i"
                  />
                  <p
                    v-if="i.approvedMinor !== null"
                    class="text-sm"
                  >
                    {{ i.partReason ? t('budgets.screens.claims.approved-part', { amount: money(i.approvedMinor), reason: i.partReason }) : t('budgets.screens.claims.approved-amount', { amount: money(i.approvedMinor) }) }}
                  </p>
                  <BudgetsClaimDecision
                    v-if="deciding && decisions[i.id]"
                    v-model="decisions[i.id]!"
                    :item="i"
                    :lines="lineItems"
                    :categories="categoryItems"
                    :currency="data.claim.currency"
                  />
                </div>
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="data.events.length"
          :title="t('budgets.screens.claims.log')"
        >
          <BudgetsClaimLog
            :events="data.events"
            :currency="data.claim.currency"
          />
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!noting"
      :title="noting ? t(`budgets.screens.claims.${noting}`) : ''"
      @update:open="v => { if (!v) noting = null }"
    >
      <template #body>
        <UForm
          id="budgets-claim-note"
          :state="{ note }"
          :validate="() => needs({ note })"
          class="space-y-4"
          novalidate
          @submit="sendNote"
        >
          <UFormField
            name="note"
            :label="t('budgets.screens.approvals.note')"
            :help="t('budgets.screens.claims.note-help')"
            required
          >
            <UTextarea
              v-model="note"
              maxlength="500"
              :rows="3"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="budgets-claim-note"
          :label="noting ? t(`budgets.screens.claims.${noting}`) : ''"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
