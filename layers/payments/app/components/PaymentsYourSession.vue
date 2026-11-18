<!-- Your session (selling proposal, 17 November 2026): the seller's own till session, at the top of
     Sessions. The till opens it; here it is moved to another place, closed by hand, or cashed up.
     Without cash a session closes in one step and also closes itself after a quiet spell. With cash,
     closing stops it and it waits to be counted, which does not stop the seller opening the next.
     A payment still waiting for an answer stops it closing; each is named with when it turns unknown.
     A hand-off to the SumUp app that started nowhere else returns here. -->
<script setup lang="ts">
import type { YourSale, YourSession, YourSessionSummary as Session } from '../../shared/sessions'

const props = defineProps<{ data: YourSession }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const { money } = await useMoney()
const { dateTime: when, time } = useDates()
const { toRefusal } = useRefusal()
const toast = useToast()

// The SumUp app sends the seller back here with what it says happened.
const handoff = computed(() => {
  const result = route.query.result
  if (!route.query.attempt || typeof result !== 'string') return null
  return result === 'succeeded' ? 'succeeded' : result === 'failed' ? 'failed' : 'unknown'
})

const busy = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const tillName = (s: Session) => [s.place ?? t('payments.screens.session.unknown-place'), s.pointLabel].filter(Boolean).join(' · ')

async function act(run: () => Promise<unknown>, done?: string) {
  busy.value = true
  refusal.value = null
  try {
    await run()
    if (done) toast.add({ title: done, color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
    emit('changed')
  }
}

// Moving the session remembers the place on this device, where the till opens the next one.
async function move(spaceId: string | null) {
  const session = props.data.session
  if (!session) return
  try { localStorage.setItem('payments.till.space', spaceId ?? '') }
  catch { /* storage refused: the next session opens at the default */ }
  await act(() => $api(`/api/payments/sessions/${session.id}` as string, { method: 'PATCH', body: { spaceId } }), t('payments.screens.session.moved'))
}

// Without cash there is nothing to count, so stopping and closing are one step: the count fixes no
// cash expected, and the close records none counted. With cash, counting stops new payments and the
// session moves below, to be counted and closed.
async function close() {
  const session = props.data.session
  if (!session) return
  await act(async () => {
    await $api(`/api/payments/sessions/${session.id}/count` as string, { method: 'POST', body: {} })
    if (!session.handlesCash) await $api(`/api/payments/sessions/${session.id}/close` as string, { method: 'POST', body: { countedMinor: 0 } })
  }, session.handlesCash ? undefined : t('payments.screens.close.done'))
}

const facts = (s: Session) => [
  { label: t('payments.screens.session.opened-at'), value: when(s.openedAt), strong: false },
  ...(s.lastSaleAt && s.lastSaleAt > s.openedAt ? [{ label: t('payments.screens.session.last-sale'), value: when(s.lastSaleAt), strong: false }] : []),
  ...(s.handlesCash
    ? [
        { label: t('payments.screens.session.float'), value: money(s.floatMinor, s.currency), strong: false },
        { label: t('payments.screens.session.expected'), value: money(s.expectedCashMinor, s.currency) },
      ]
    : s.closesAt ? [{ label: t('payments.screens.session.closes-at'), value: time(s.closesAt), strong: false }] : []),
]
const methodLabel = (method: string) => t(`payments.screens.methods.${method}`)
// What the session has taken, each way of paying and in all.
const takings = computed(() => props.data.takings ?? [])
const takenInAll = computed(() => takings.value.reduce((sum, m) => sum + m.amountMinor, 0))
const saleName = (s: YourSale) => [money(s.amountMinor, s.currency), s.methods.map(methodLabel).join(', ')].filter(Boolean).join(' · ')
const saleAbout = (s: YourSale) => [time(s.at), s.state === 'succeeded' ? '' : t(`payments.screens.session.sale-states.${s.state}`), ...s.notes].filter(Boolean).join(' · ')
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="handoff"
      :color="handoff === 'succeeded' ? 'success' : handoff === 'failed' ? 'error' : 'warning'"
      :icon="handoff === 'succeeded' ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
      :title="t(`payments.screens.session.handoff.${handoff}`)"
      :description="t(`payments.screens.session.handoff.${handoff}-help`)"
    />

    <PaymentsHandBack @changed="emit('changed')" />

    <PageSection
      :title="t('payments.screens.session.yours')"
      :description="data.session ? undefined : t('payments.screens.session.none-open')"
    >
      <template #actions>
        <StatusBadge
          v-if="data.session"
          tone="success"
          :label="t('payments.screens.session.states.open')"
        />
      </template>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <template v-if="data.session">
          <UFormField
            :label="t('payments.screens.session.place')"
            :help="t('payments.screens.session.place-help')"
          >
            <PaymentsSessionPlace
              :model-value="data.session.spaceId"
              :disabled="busy"
              @update:model-value="move"
            />
          </UFormField>
          <FactStrip :facts="facts(data.session)" />

          <div
            v-if="takings.length"
            class="space-y-2"
          >
            <p class="font-medium">
              {{ t('payments.screens.session.takings-title') }}
            </p>
            <FactStrip :facts="[...takings.map(m => ({ label: methodLabel(m.method), value: money(m.amountMinor, data.session!.currency), strong: false })), { label: t('payments.screens.session.takings-total'), value: money(takenInAll, data.session.currency) }]" />
          </div>

          <div
            v-if="data.sales?.length"
            class="space-y-2"
          >
            <p class="font-medium">
              {{ t('payments.screens.session.sales-title') }}
            </p>
            <RecordList :label="t('payments.screens.session.sales-title')">
              <RecordListItem
                v-for="s in data.sales"
                :key="s.intentId"
                :name="saleName(s)"
                :description="saleAbout(s)"
                :muted="s.state !== 'succeeded'"
              />
            </RecordList>
          </div>

          <div
            v-if="data.waiting.length"
            class="space-y-2"
          >
            <p class="font-medium">
              {{ t('payments.screens.session.waiting-title') }}
            </p>
            <p class="text-sm text-muted">
              {{ t('payments.screens.session.waiting-help') }}
            </p>
            <RecordList :label="t('payments.screens.session.waiting-title')">
              <RecordListItem
                v-for="w in data.waiting"
                :key="w.id"
                :name="`${money(w.amountMinor, w.currency)} · ${methodLabel(w.method)} · ${w.provider}`"
                :description="w.unknownAt ? t('payments.screens.session.unknown-at', { started: time(w.startedAt), at: time(w.unknownAt) }) : t('payments.screens.session.unknown-now', { started: time(w.startedAt) })"
              />
            </RecordList>
          </div>

          <p class="text-sm text-muted">
            {{ data.session.handlesCash ? t('payments.screens.session.cash-up-help') : t('payments.screens.session.close-help-no-cash') }}
          </p>
        </template>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="data.session"
            :loading="busy"
            :disabled="data.waiting.length > 0"
            :label="data.session.handlesCash ? t('payments.screens.session.cash-up-button') : t('payments.screens.close.button')"
            :icon="data.session.handlesCash ? 'i-lucide-calculator' : 'i-lucide-lock'"
            @click="close"
          />
          <UButton
            to="/live/till"
            color="neutral"
            variant="outline"
            icon="i-lucide-shopping-basket"
            :label="t('payments.screens.session.open-till')"
          />
        </div>
      </div>
    </PageSection>

    <PageSection
      v-for="s in data.awaiting"
      :key="s.id"
      :title="t('payments.screens.session.awaiting-title', { till: tillName(s), when: when(s.openedAt) })"
    >
      <template #actions>
        <StatusBadge
          tone="warning"
          :label="t('payments.screens.session.states.counting')"
        />
      </template>
      <PaymentsCloseSession
        :session="s"
        @closed="emit('changed')"
      />
    </PageSection>
  </div>
</template>
