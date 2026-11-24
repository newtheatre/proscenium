<!-- A claim, for its claimant (BC-19 to BC-24). While a draft or sent back, items are added with a
     receipt photographed for each, or a reason; the claimant declares it true and submits it. Once
     submitted it is fixed: each item shows what was approved and why less, and the log says who did
     what. A claim nobody has decided can be withdrawn. -->
<script setup lang="ts">
import type { ClaimItem } from '../../../../composables/useClaim'

interface OfferedLine { id: string, name: string, budgetId: string, budgetName: string, currency: string }
interface Category { id: string, name: string, description: string }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { day } = useDates()
const text = useBudgetText()
const { data, status, error, refresh, act, title } = await useClaim(id)
const { data: choices } = await useAPI<{ lines: OfferedLine[], categories: Category[] }>('/api/budgets/expenses', { key: 'budgets:expenses' })

const editable = computed(() => !!data.value && data.value.mine && ['draft', 'returned'].includes(data.value.claim.state))
const withdrawable = computed(() => !!data.value && data.value.mine && ['draft', 'submitted', 'returned'].includes(data.value.claim.state))
const sentBack = computed(() => data.value?.claim.state === 'returned' ? [...data.value.events].reverse().find(e => e.action === 'returned')?.note ?? null : null)
const declared = ref(false)
const editing = ref<ClaimItem | null>(null)
const itemOpen = ref(false)
function openItem(item: ClaimItem | null) {
  editing.value = item
  itemOpen.value = true
}
const { $api } = useNuxtApp()
async function removeItem(item: ClaimItem) {
  await $api(`/api/budgets/claims/${id.value}/items/${item.id}` as string, { method: 'DELETE', body: {} }).catch(() => undefined)
  await refresh()
}
const submit = () => act('/submit', { declared: true }, 'budgets.screens.claims.submitted')
const withdraw = () => act('/withdraw', {}, 'budgets.screens.claims.withdrawn')

function describe(i: ClaimItem) {
  return [i.description, i.supplier, day(i.spentOn), i.lineName ? `${i.budgetName}: ${i.lineName}` : t('budgets.screens.claims.no-line'), i.noReceiptReason ? t('budgets.screens.claims.no-receipt-because', { reason: i.noReceiptReason }) : null].filter(Boolean).join(' · ')
}
function decided(i: ClaimItem) {
  if (i.approvedMinor === null || !data.value) return null
  const amount = text.money(i.approvedMinor, data.value.claim.currency)
  return i.partReason ? t('budgets.screens.claims.approved-part', { amount, reason: i.partReason }) : t('budgets.screens.claims.approved-amount', { amount })
}
const actions = computed(() => [
  ...(editable.value ? [{ label: t('budgets.screens.claims.item-add'), icon: 'i-lucide-plus', onSelect: () => openItem(null) }] : []),
])
const menu = computed(() => withdrawable.value ? [{ label: t('budgets.screens.claims.withdraw'), icon: 'i-lucide-x', onSelect: withdraw }] : [])
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('budgets.navigation.expenses.label'), to: '/members/expenses' }]"
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
        <div class="flex flex-wrap items-center gap-3">
          <StatusBadge v-bind="text.claimState(data.claim.state)" />
          <span class="text-lg font-semibold">{{ text.money(data.claim.totalMinor, data.claim.currency) }}</span>
          <span
            v-if="data.claim.approvedMinor !== null"
            class="text-muted"
          >{{ t('budgets.screens.claims.approved-amount', { amount: text.money(data.claim.approvedMinor, data.claim.currency) }) }}</span>
        </div>
        <UAlert
          v-if="sentBack"
          color="warning"
          variant="subtle"
          icon="i-lucide-message-square"
          :title="t('budgets.screens.claims.sent-back')"
          :description="sentBack"
        />
        <PageSection :title="t('budgets.screens.claims.items')">
          <EmptyState
            v-if="!data.items.length"
            icon="i-lucide-receipt"
            :title="t('budgets.screens.claims.no-items')"
            :description="t('budgets.screens.claims.no-items-help')"
          />
          <RecordList
            v-else
            :label="t('budgets.screens.claims.items')"
          >
            <RecordListItem
              v-for="i in data.items"
              :key="i.id"
              icon="i-lucide-shopping-bag"
              :name="text.money(i.amountMinor, data.claim.currency)"
              :description="describe(i)"
            >
              <template #below>
                <p
                  v-if="decided(i)"
                  class="text-sm"
                >
                  {{ decided(i) }}
                </p>
                <BudgetsClaimReceipts
                  :claim-id="data.claim.id"
                  :item="i"
                  :editable="editable"
                  @changed="refresh()"
                />
              </template>
              <RowActions
                v-if="editable"
                :items="[{ label: t('budgets.screens.claims.item-edit'), icon: 'i-lucide-pencil', onSelect: () => openItem(i) }, { label: t('budgets.screens.claims.item-remove'), icon: 'i-lucide-trash-2', onSelect: () => removeItem(i) }]"
                :label="t('budgets.screens.claims.item-actions')"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="editable && data.items.length"
          :title="t('budgets.screens.claims.declare-title')"
        >
          <div class="space-y-4">
            <UCheckbox
              v-model="declared"
              :label="t('budgets.screens.claims.declare')"
            />
            <UButton
              :disabled="!declared"
              icon="i-lucide-send"
              :label="t('budgets.screens.claims.submit')"
              @click="submit"
            />
          </div>
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
    <BudgetsClaimItemDialog
      v-if="data"
      v-model:open="itemOpen"
      :claim-id="data.claim.id"
      :item="editing"
      :lines="choices?.lines ?? []"
      :categories="choices?.categories ?? []"
      :currency="data.claim.currency"
      @saved="refresh()"
    />
  </PageFrame>
</template>
