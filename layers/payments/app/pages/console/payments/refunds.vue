<!-- Refunds (Box office specification, part 5): requests waiting for approval, with who asked and what
     for, and refunds on their way back. A refund one person may not approve alone is refused for the
     person who asked. Cash, and payments taken on a machine not connected to the site, are handed back
     by a person, who confirms it here once they have. -->
<script setup lang="ts">
interface Refund { id: string, owner: { module: string, record: string }, amountMinor: number, currency: string, method: string, state: State, requestedByName: string | null, approvedByName: string | null, createdAt: number, handBack: boolean }
type State = 'requested' | 'approved' | 'sent' | 'succeeded' | 'failed' | 'declined'

const { t, te } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const router = useRouter()
const { money } = await useMoney()
const { dateTime: when } = useDates()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()

const STATES: State[] = ['requested', 'approved', 'sent', 'succeeded', 'failed', 'declined']
const state = computed<State>({
  get: () => (STATES.includes(route.query.state as State) ? route.query.state as State : 'requested'),
  set: (value) => { void router.replace({ query: { ...route.query, state: value } }) },
})
const tabs = STATES.map(s => ({ label: t(`payments.screens.refunds.states.${s}`), value: s }))
const query = computed(() => ({ state: state.value }))
const { data, status, error, refresh } = await useAPI<{ refunds: Refund[] }>('/api/payments/refunds', { query, key: 'payments:refunds' })
const { data: reasons } = await useAPI<{ reasons: { id: string, label: string }[] }>('/api/payments/refunds/decline-reasons', { key: 'payments:decline-reasons', default: () => ({ reasons: [] }) })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const methodLabel = (method: string) => t(`payments.screens.methods.${method}`)
const ownerLabel = (r: Refund) => (te(`${r.owner.module}.module.name`) ? t(`${r.owner.module}.module.name`) : r.owner.module)

async function act(r: Refund, verb: 'approve' | 'confirm') {
  const ok = await confirm({
    verb: t(`payments.screens.refunds.${verb}-verb`),
    thing: t('payments.screens.refunds.thing', { amount: money(r.amountMinor, r.currency), method: methodLabel(r.method) }),
    consequence: t(`payments.screens.refunds.${verb}-consequence`),
    button: t(`payments.screens.refunds.${verb}-button`),
  })
  if (!ok) return
  refusal.value = null
  try {
    await $api(`/api/payments/refunds/${r.id}/${verb}` as string, { method: 'POST', body: {} })
    toast.add({ title: t(`payments.screens.refunds.${verb}-done`), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const declining = ref<Refund | null>(null)
const reason = ref<string | undefined>(undefined)
const declineRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openDecline(r: Refund) {
  declining.value = r
  reason.value = undefined
  declineRefusal.value = null
}
async function decline() {
  if (!declining.value || !reason.value) return
  declineRefusal.value = null
  try {
    await $api(`/api/payments/refunds/${declining.value.id}/decline` as string, { method: 'POST', body: { reasonTermId: reason.value } })
    declining.value = null
    toast.add({ title: t('payments.screens.refunds.declined'), color: 'success' })
    await refresh()
  }
  catch (e) {
    declineRefusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame :title="t('payments.navigation.refunds.label')">
    <template #toolbar>
      <UTabs
        v-model="state"
        :items="tabs"
        :content="false"
        variant="link"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <EmptyState
            v-if="!loaded.refunds.length"
            :title="t(`payments.screens.refunds.empty.${state}`)"
            :description="t('payments.screens.refunds.empty-help')"
            icon="i-lucide-undo-2"
          />
          <ul
            v-else
            class="divide-y divide-default rounded-lg border border-default"
          >
            <li
              v-for="r in loaded.refunds"
              :key="r.id"
              class="flex flex-wrap items-center gap-3 px-3 py-3"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ money(r.amountMinor, r.currency) }} · {{ methodLabel(r.method) }} · {{ ownerLabel(r) }}
                </p>
                <p class="text-sm text-muted">
                  {{ t('payments.screens.refunds.asked', { person: r.requestedByName ?? t('payments.screens.refunds.the-system'), when: when(r.createdAt) }) }}<template v-if="r.approvedByName">
                    · {{ t('payments.screens.refunds.approved-by', { person: r.approvedByName }) }}
                  </template>
                </p>
              </div>
              <template v-if="r.state === 'requested'">
                <UButton
                  :label="t('payments.screens.refunds.approve-button')"
                  size="sm"
                  @click="act(r, 'approve')"
                />
                <UButton
                  :label="t('payments.screens.refunds.decline-button')"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="openDecline(r)"
                />
              </template>
              <UButton
                v-else-if="r.state === 'approved' && r.handBack"
                :label="t('payments.screens.refunds.confirm-button')"
                size="sm"
                @click="act(r, 'confirm')"
              />
            </li>
          </ul>
        </div>
      </template>
    </DataBoundary>

    <UModal
      :open="!!declining"
      :title="t('payments.screens.refunds.decline-title')"
      @update:open="(open: boolean) => { if (!open) declining = null }"
    >
      <template #body>
        <form
          id="decline-refund"
          class="space-y-4"
          @submit.prevent="decline"
        >
          <RefusalNotice :refusal="declineRefusal" />
          <UFormField
            :label="t('payments.screens.refunds.decline-reason')"
            required
          >
            <USelect
              v-model="reason"
              :items="reasons?.reasons.map(r => ({ value: r.id, label: r.label })) ?? []"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="decline-refund"
          :disabled="!reason"
          :label="t('payments.screens.refunds.decline-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
