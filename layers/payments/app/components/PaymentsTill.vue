<!-- The till (Box office specification, part 4): Payments' desk component. Each module with something
     to sell at the desk draws its own panel (payments.desk-basket); the till shows what the filled
     panels add up to, makes the one payment for the total in the seller's open session and takes it
     by any way to pay on offer at the desk. Another way is offered only once an attempt is known to
     have failed, so nobody pays twice. After a sale the panels are emptied; after a cancel they keep
     what was in them, so the seller can try again. -->
<script setup lang="ts">
interface Panel { id: string, label: string, panel: string }
interface Summary { basket: string, lines: { label: string, amountMinor: number }[], amountMinor: number }
interface Offer { providerAccountId: string, provider: string, label: string, method: string, mode: 'live' | 'test', readers?: { id: string, label: string }[] }
type Next = { kind: 'redirect' | 'handoff', url: string } | { kind: 'client-secret', secret: string } | { kind: 'waiting-for-reader' | 'none' }
interface Status { state: string, amountMinor: number, currency: string, paidMinor: number, waiting: boolean }

const emit = defineEmits<{ settled: [{ intentId: string, amountMinor: number }] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { currency, money, toMinor } = await useMoney()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const { data: session } = await useAPI<{ session: { id: string, state: string } | null }>('/api/payments/session', { key: 'payments:session' })
const open = computed(() => session.value?.session?.state === 'open')
const { data: loaded, status, error, refresh } = await useAPI<{ panels: Panel[] }>('/api/payments/till/panels', { key: 'payments:till-panels', immediate: open.value })
watch(open, (now) => { if (now && !loaded.value) refresh() })

// A panel component no layer supplies is left out rather than breaking the till.
const panels = computed(() => (loaded.value?.panels ?? []).flatMap((p) => {
  const component = resolveComponent(p.panel)
  return typeof component === 'string' ? [] : [{ ...p, component }]
}))

const inputs = reactive<Record<string, unknown>>({})
const filled = computed(() => panels.value.filter(p => inputs[p.id] !== null && inputs[p.id] !== undefined).map(p => ({ basket: p.id, input: inputs[p.id] })))

// What the filled panels add up to, asked again shortly after the seller stops changing them.
const summary = ref<{ panels: Summary[], amountMinor: number } | null>(null)
const summing = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let asked = 0
async function sum() {
  const ask = ++asked
  if (!filled.value.length) {
    summary.value = null
    refusal.value = null
    return
  }
  summing.value = true
  try {
    const answer = await $api<{ panels: Summary[], amountMinor: number }>('/api/payments/till/summary', { method: 'POST', body: { panels: filled.value } })
    if (ask !== asked) return
    summary.value = answer
    refusal.value = null
  }
  catch (e) {
    if (ask !== asked) return
    summary.value = null
    refusal.value = toRefusal(e)
  }
  finally {
    if (ask === asked) summing.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(filled, () => {
  clearTimeout(timer)
  timer = setTimeout(sum, 300) // not-policy: a pause in typing before the total is asked again
}, { deep: true })
const summaryOf = (id: string) => summary.value?.panels.find(p => p.basket === id) ?? null

// The payment being taken: one intent for the total, paid by one way after another until it settles.
const sale = ref<{ intentId: string, amountMinor: number, key: string } | null>(null)
const saleKey = ref(crypto.randomUUID())
const taking = ref(false)
const payment = ref<Status | null>(null)
const result = ref<{ kind: 'declined' | 'waiting' | 'handoff', url?: string } | null>(null)
const changeMinor = ref(0)
const offered = ref<{ methods: Offer[] } | null>(null)

async function takePayment() {
  if (!summary.value || summary.value.amountMinor <= 0) return
  taking.value = true
  refusal.value = null
  try {
    const made = await $api<{ intentId: string, amountMinor: number }>('/api/payments/till/sale', { method: 'POST', body: { panels: filled.value }, headers: { 'idempotency-key': saleKey.value } })
    sale.value = { ...made, key: crypto.randomUUID() }
    payment.value = { state: 'open', amountMinor: made.amountMinor, currency: currency.value, paidMinor: 0, waiting: false }
    result.value = null
    if (!offered.value) offered.value = await $api<{ methods: Offer[] }>('/api/payments/till/methods')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

const due = computed(() => (payment.value ? payment.value.amountMinor - payment.value.paidMinor : 0))
const methods = computed(() => offered.value?.methods ?? [])
const choice = ref<string | undefined>(undefined)
const chosen = computed(() => methods.value.find(m => key(m) === choice.value))
const key = (m: Offer) => `${m.providerAccountId}:${m.method}`
const tendered = ref<number | undefined>(undefined)
const readerId = ref<string | undefined>(undefined)
watch(chosen, (m) => {
  tendered.value = undefined
  readerId.value = m?.readers?.length === 1 ? m.readers[0]!.id : undefined
})
const methodLabel = (m: Offer) => (m.method === 'cash' ? t('payments.screens.methods.cash') : `${t(`payments.screens.methods.${m.method}`)} · ${m.label}`)

async function check() {
  if (!sale.value) return
  const now = await $api<Status>(`/api/payments/intents/${sale.value.intentId}` as string)
  payment.value = now
  if (now.state === 'succeeded') return done()
  if (now.state === 'unfulfilled') return undone()
  if (now.state !== 'open') return ended()
  if (!now.waiting && result.value?.kind === 'waiting') result.value = { kind: 'declined' }
}

let polling: ReturnType<typeof setInterval> | undefined
function poll() {
  clearInterval(polling)
  polling = setInterval(() => { check().catch(() => {}) }, 3000) // not-policy: how often the screen asks while a reader is busy
}
function stopPolling() {
  clearInterval(polling)
  polling = undefined
}
onBeforeUnmount(() => {
  stopPolling()
  clearTimeout(timer)
})

async function pay(succeeded = true) {
  const m = chosen.value
  if (!sale.value || !m) return
  taking.value = true
  refusal.value = null
  result.value = null
  try {
    if (m.method === 'cash' || m.method.endsWith('_attested')) {
      const tenderedMinor = m.method === 'cash' && tendered.value !== undefined ? toMinor(tendered.value) : undefined
      const answer = await $api<{ settled: boolean, unfulfilled: boolean, changeMinor: number }>(`/api/payments/intents/${sale.value.intentId}/attest` as string, {
        method: 'POST',
        body: { providerAccountId: m.providerAccountId, method: m.method, tenderedMinor, succeeded: m.method === 'cash' ? undefined : succeeded },
        headers: { 'idempotency-key': sale.value.key },
      })
      sale.value.key = crypto.randomUUID()
      changeMinor.value = answer.changeMinor
      if (answer.unfulfilled) return undone()
      if (!succeeded) result.value = { kind: 'declined' }
      await check()
    }
    else {
      const started = await $api<{ next: Next, state: string, settled: boolean, unfulfilled: boolean }>(`/api/payments/intents/${sale.value.intentId}/start` as string, {
        method: 'POST',
        body: { providerAccountId: m.providerAccountId, method: m.method, readerId: readerId.value },
        headers: { 'idempotency-key': sale.value.key },
      })
      sale.value.key = crypto.randomUUID()
      if (started.unfulfilled) return undone()
      if (started.settled) return check()
      if (started.state === 'failed') {
        result.value = { kind: 'declined' }
        return
      }
      if (started.next.kind === 'handoff' || started.next.kind === 'redirect') result.value = { kind: 'handoff', url: started.next.url }
      else result.value = { kind: 'waiting' }
      poll()
    }
  }
  catch (e) {
    sale.value.key = crypto.randomUUID()
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

const waiting = computed(() => result.value?.kind === 'waiting' || result.value?.kind === 'handoff' || !!payment.value?.waiting)

async function cancel() {
  if (!sale.value) return
  const ok = await confirm({
    verb: t('payments.screens.till.cancel-verb'),
    thing: money(sale.value.amountMinor),
    consequence: waiting.value ? t('payments.screens.till.cancel-waiting') : t('payments.screens.till.cancel-consequence'),
    button: t('payments.screens.till.cancel-button'),
  })
  if (!ok) return
  taking.value = true
  try {
    await $api(`/api/payments/intents/${sale.value.intentId}/cancel` as string, { method: 'POST', body: {} })
    ended()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

function reset() {
  stopPolling()
  sale.value = null
  payment.value = null
  result.value = null
  choice.value = undefined
  saleKey.value = crypto.randomUUID()
}
function done() {
  const finished = sale.value!
  const change = changeMinor.value
  reset()
  for (const p of panels.value) inputs[p.id] = null
  toast.add({ title: t('payments.screens.till.paid', { amount: money(finished.amountMinor) }), description: change > 0 ? t('payments.screens.till.change', { amount: money(change) }) : undefined, color: 'success' })
  emit('settled', { intentId: finished.intentId, amountMinor: finished.amountMinor })
}
function undone() {
  reset()
  for (const p of panels.value) inputs[p.id] = null
  toast.add({ title: t('payments.screens.till.unfulfilled'), description: t('payments.screens.till.unfulfilled-help'), color: 'error' })
}
function ended() {
  reset()
  toast.add({ title: t('payments.screens.till.cancelled'), color: 'neutral' })
  sum()
}
</script>

<template>
  <div>
    <EmptyState
      v-if="!open"
      :title="t('payments.screens.till.no-session')"
      :description="t('payments.screens.till.no-session-help')"
      icon="i-lucide-calculator"
    >
      <template #actions>
        <UButton
          to="/console/payments/session"
          :label="t('payments.screens.session.open-button')"
        />
      </template>
    </EmptyState>

    <DataBoundary
      v-else
      :data="loaded"
      :status="status"
      :error="error"
      :skeleton-rows="3"
      @retry="refresh()"
    >
      <template #default>
        <EmptyState
          v-if="!panels.length"
          :title="t('payments.screens.till.no-panels')"
          :description="t('payments.screens.till.no-panels-help')"
          icon="i-lucide-shopping-basket"
        />
        <div
          v-else
          class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div class="space-y-6">
            <PageSection
              v-for="p in panels"
              :key="p.id"
              :title="t(p.label)"
            >
              <component
                :is="p.component"
                v-model="inputs[p.id]"
                :locked="!!sale"
                :summary="summaryOf(p.id)"
              />
            </PageSection>
          </div>

          <aside
            class="space-y-4 rounded-lg border border-default p-4 lg:sticky lg:top-4 lg:self-start"
            :aria-label="t('payments.screens.till.total-label')"
          >
            <ul
              v-if="summary?.panels.length"
              class="space-y-1"
            >
              <template
                v-for="s in summary.panels"
                :key="s.basket"
              >
                <li
                  v-for="(line, i) in s.lines"
                  :key="`${s.basket}-${i}`"
                  class="flex justify-between gap-3 text-sm"
                >
                  <span>{{ line.label }}</span>
                  <span>{{ money(line.amountMinor) }}</span>
                </li>
              </template>
            </ul>
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('payments.screens.till.nothing-yet') }}
            </p>
            <p
              class="flex justify-between text-lg font-semibold"
              aria-live="polite"
            >
              <span>{{ t('payments.screens.till.total') }}</span>
              <span>{{ money(summary?.amountMinor ?? 0) }}</span>
            </p>

            <RefusalNotice :refusal="refusal" />

            <UButton
              v-if="!sale"
              block
              size="lg"
              icon="i-lucide-banknote"
              :loading="taking"
              :disabled="summing || !summary || summary.amountMinor <= 0"
              :label="t('payments.screens.till.take', { amount: money(summary?.amountMinor ?? 0) })"
              @click="takePayment"
            />

            <div
              v-else
              class="space-y-4"
            >
              <p class="font-medium">
                {{ t('payments.screens.till.due', { amount: money(due) }) }}
              </p>

              <UAlert
                v-if="result?.kind === 'declined'"
                color="warning"
                icon="i-lucide-circle-x"
                :title="t('payments.screens.till.declined')"
                :description="t('payments.screens.till.declined-help')"
              />
              <UAlert
                v-else-if="waiting"
                color="info"
                icon="i-lucide-loader"
                :title="t('payments.screens.till.waiting')"
                :description="t('payments.screens.till.waiting-help')"
              >
                <template #actions>
                  <UButton
                    v-if="result?.kind === 'handoff'"
                    :to="result.url"
                    external
                    size="sm"
                    :label="t('payments.screens.test.open')"
                  />
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    :label="t('payments.screens.test.check')"
                    @click="check()"
                  />
                </template>
              </UAlert>

              <template v-if="!waiting">
                <p
                  v-if="!methods.length"
                  class="text-sm text-muted"
                >
                  {{ t('payments.screens.till.no-methods') }}
                </p>
                <URadioGroup
                  v-else
                  v-model="choice"
                  :legend="t('payments.screens.till.how')"
                  :items="methods.map(m => ({ value: key(m), label: methodLabel(m), description: m.mode === 'test' ? t('payments.screens.providers.test-mode') : undefined }))"
                />

                <UFormField
                  v-if="chosen?.method === 'cash'"
                  :label="t('payments.screens.till.tendered')"
                  :hint="t('payments.screens.optional')"
                  :help="t('payments.screens.till.tendered-help')"
                >
                  <UInputNumber
                    v-model="tendered"
                    :min="0"
                    :step="0.01"
                    :format-options="{ style: 'currency', currency }"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  v-if="chosen?.method === 'card_reader'"
                  :label="t('payments.screens.test.reader')"
                  required
                >
                  <USelect
                    v-model="readerId"
                    :items="(chosen.readers ?? []).map(r => ({ value: r.id, label: r.label }))"
                    class="w-full"
                  />
                </UFormField>

                <div
                  v-if="chosen"
                  class="flex flex-wrap gap-2"
                >
                  <UButton
                    :loading="taking"
                    :disabled="chosen.method === 'card_reader' && !readerId"
                    :label="chosen.method.endsWith('_attested') ? t('payments.screens.till.approved') : chosen.method === 'cash' ? t('payments.screens.till.cash-taken') : t('payments.screens.till.start')"
                    @click="pay()"
                  />
                  <UButton
                    v-if="chosen.method.endsWith('_attested')"
                    color="neutral"
                    variant="outline"
                    :disabled="taking"
                    :label="t('payments.screens.till.machine-declined')"
                    @click="pay(false)"
                  />
                </div>
              </template>

              <UButton
                color="neutral"
                variant="ghost"
                :disabled="taking"
                :label="t('payments.screens.till.cancel-button')"
                @click="cancel"
              />
            </div>
          </aside>
        </div>
      </template>
    </DataBoundary>
  </div>
</template>
