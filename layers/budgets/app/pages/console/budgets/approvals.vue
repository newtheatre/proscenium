<!-- Approvals (BC-16, BC-21): claims and requests to spend waiting on this person, oldest first: on
     the budgets they hold, or every one for the treasurer, never their own. Each shows how far over
     budget approving it would go; over budget, only the treasurer approves, and a holder sees who it
     needs. A claim opens for review beside its receipts, marked when late or not asked for first. -->
<script setup lang="ts">
interface WaitingClaim { id: string, number: string | null, title: string, claimant: string | null, currency: string, totalMinor: number, submittedAt: number | null, overMinor: number, late: boolean, notAskedFirst: boolean }
interface Waiting { id: string, lineName: string, budgetId: string, budgetName: string, currency: string, amountMinor: number, description: string, neededBy: string | null, createdAt: number, overMinor: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { day } = useDates()
const toast = useToast()
const text = useBudgetText()
const { data, status, error, refresh } = await useAPI<{ requests: Waiting[], claims: WaitingClaim[], approvesAny: boolean }>('/api/budgets/approvals', { key: 'budgets:approvals' })

function describe(r: Waiting) {
  return [
    `${r.budgetName}: ${r.lineName}`,
    r.description,
    r.neededBy ? t('budgets.screens.approvals.needed-by', { day: day(r.neededBy) }) : null,
    t('budgets.screens.approvals.asked', { day: day(r.createdAt) }),
  ].filter(Boolean).join(' · ')
}
function describeClaim(c: WaitingClaim) {
  return [c.claimant, c.submittedAt ? t('budgets.screens.approvals.submitted', { day: day(c.submittedAt) }) : null, c.late ? t('budgets.screens.claims.late') : null, c.notAskedFirst ? t('budgets.screens.claims.not-asked-first') : null].filter(Boolean).join(' · ')
}
const empty = computed(() => !!data.value && !data.value.requests.length && !data.value.claims.length)
const mayApprove = (r: Waiting) => !r.overMinor || !!data.value?.approvesAny
async function approve(r: Waiting) {
  try {
    await $api(`/api/budgets/requests/${r.id}/approve` as string, { method: 'POST', body: {} })
    toast.add({ title: t('budgets.screens.approvals.approved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
function actions(r: Waiting) {
  return [
    ...(mayApprove(r) ? [{ label: approveLabel(r), icon: 'i-lucide-check', onSelect: () => approve(r) }] : []),
    { label: t('budgets.screens.approvals.decline'), icon: 'i-lucide-x', onSelect: () => openDecline(r) },
  ]
}
const approveLabel = (r: Waiting) => r.overMinor ? t('budgets.screens.approvals.approve-over', { amount: text.money(r.overMinor, r.currency) }) : t('budgets.screens.approvals.approve')

// Declining, with a note.
const declining = ref<Waiting | null>(null)
const note = ref('')
const noteEl = useFormRef('noteEl')
const noteRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openDecline(r: Waiting) {
  note.value = ''
  noteRefusal.value = null
  declining.value = r
}
async function decline() {
  noteRefusal.value = null
  try {
    await $api(`/api/budgets/requests/${declining.value!.id}/decline` as string, { method: 'POST', body: { note: note.value.trim() } })
    declining.value = null
    toast.add({ title: t('budgets.screens.approvals.declined'), color: 'success' })
    await refresh()
  }
  catch (e) {
    noteRefusal.value = toRefusal(e)
    noteEl.value?.setErrors(fieldErrors(noteRefusal.value))
  }
}
</script>

<template>
  <PageFrame
    :title="t('budgets.navigation.approvals.label')"
    :description="t('budgets.screens.approvals.help')"
    :trail="[{ label: t('budgets.navigation.budgets.label'), to: '/console/budgets' }]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && empty"
        icon="i-lucide-inbox"
        :title="t('budgets.screens.approvals.none')"
      />
      <div
        v-else-if="data"
        class="space-y-6"
      >
        <PageSection
          v-if="data.claims.length"
          :title="t('budgets.screens.approvals.claims')"
        >
          <RecordList :label="t('budgets.screens.approvals.claims')">
            <RecordListItem
              v-for="c in data.claims"
              :key="c.id"
              icon="i-lucide-receipt"
              :name="`${c.number ?? ''} ${c.title}: ${text.money(c.totalMinor, c.currency)}`"
              :description="describeClaim(c)"
              :to="`/console/budgets/claims/${c.id}`"
            >
              <template #below>
                <span
                  v-if="c.overMinor"
                  class="text-sm text-warning"
                >
                  {{ data.approvesAny ? t('budgets.screens.approvals.over', { amount: text.money(c.overMinor, c.currency) }) : t('budgets.screens.approvals.needs-treasurer', { amount: text.money(c.overMinor, c.currency) }) }}
                </span>
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="data.requests.length"
          :title="t('budgets.screens.approvals.requests')"
        >
          <RecordList :label="t('budgets.screens.approvals.requests')">
            <RecordListItem
              v-for="r in data.requests"
              :key="r.id"
              icon="i-lucide-hand-coins"
              :name="text.money(r.amountMinor, r.currency)"
              :description="describe(r)"
              :to="`/console/budgets/${r.budgetId}`"
            >
              <template #below>
                <span
                  v-if="r.overMinor"
                  class="text-sm text-warning"
                >
                  {{ mayApprove(r) ? t('budgets.screens.approvals.over', { amount: text.money(r.overMinor, r.currency) }) : t('budgets.screens.approvals.needs-treasurer', { amount: text.money(r.overMinor, r.currency) }) }}
                </span>
              </template>
              <RowActions
                :items="actions(r)"
                :label="t('budgets.screens.approvals.actions')"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!declining"
      :title="t('budgets.screens.approvals.decline')"
      @update:open="v => { if (!v) declining = null }"
    >
      <template #body>
        <UForm
          id="budgets-decline"
          ref="noteEl"
          :state="{ note }"
          :validate="() => needs({ note })"
          class="space-y-4"
          novalidate
          @submit="decline"
        >
          <RefusalNotice :refusal="noteRefusal" />
          <UFormField
            name="note"
            :label="t('budgets.screens.approvals.note')"
            :help="t('budgets.screens.approvals.note-help')"
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
          form="budgets-decline"
          :loading="noteEl?.loading"
          :label="t('budgets.screens.approvals.decline')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
