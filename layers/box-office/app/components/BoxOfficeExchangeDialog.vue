<script setup lang="ts">
// Exchanging tickets (BO-54): the chosen tickets move to another performance, seats or ticket type.
// The new seats are taken before the old ones are let go, so a full house changes nothing. The
// dialogue shows what it costs or gives back before anything happens. A dearer exchange of paid
// tickets goes to the till, which holds the new seats while the difference is paid.
interface Line { id: string, band: string | null, ticketType: string | null, amountMinor: number }
interface Offer { performanceId: string, title: string, startsAt: number, currency: string | null, rows: { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number }[] }
interface Quote { oldMinor: number, newMinor: number, differenceMinor: number, paid: boolean }

const props = defineProps<{ orderId: string, reference: string, currency: string, lines: Line[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ exchanged: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const { money } = await useMoney()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const quote = ref<Quote | null>(null)
const form = ref({ lineIds: [] as string[], performanceId: '', option: '' })

const { data: offers } = await useAPI<{ performances: Offer[] }>('/api/box-office/desk/performances', { key: 'box-office:exchange-performances', default: () => ({ performances: [] }) })
const performanceItems = computed(() => (offers.value?.performances ?? []).map(p => ({ value: p.performanceId, label: `${p.title}, ${dateTime(p.startsAt)}` })))
const optionItems = computed(() => (offers.value?.performances.find(p => p.performanceId === form.value.performanceId)?.rows ?? [])
  .map(r => ({ value: `${r.bandId}|${r.ticketTypeId}`, label: t('box-office.order.exchange.option', { band: r.band, type: r.ticketType, price: money(r.amountMinor, props.currency), free: r.free }), disabled: r.free < form.value.lineIds.length })))
const lineItems = computed(() => props.lines.map(l => ({ value: l.id, label: [l.band, l.ticketType, money(l.amountMinor, props.currency)].filter(Boolean).join(' · ') })))
const body = computed(() => {
  const [bandId, ticketTypeId] = form.value.option.split('|')
  return { lineIds: form.value.lineIds, performanceId: form.value.performanceId, bandId: bandId ?? '', ticketTypeId: ticketTypeId ?? '' }
})
const ready = computed(() => form.value.lineIds.length > 0 && !!form.value.performanceId && !!form.value.option)

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  quote.value = null
  form.value = { lineIds: props.lines.map(l => l.id), performanceId: '', option: '' }
})
watch(() => form.value.performanceId, () => {
  form.value.option = ''
})
watch([body, ready], async () => {
  quote.value = null
  refusal.value = null
  if (!ready.value) return
  try {
    quote.value = await $api<Quote>(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/exchange`, { method: 'POST', body: { ...body.value, preview: true } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}, { deep: true })

const words = computed(() => {
  const q = quote.value
  if (!q) return ''
  if (q.differenceMinor === 0) return t('box-office.order.exchange.even')
  if (q.differenceMinor < 0) return t('box-office.order.exchange.refund', { amount: money(-q.differenceMinor, props.currency) })
  return t(q.paid ? 'box-office.order.exchange.more' : 'box-office.order.exchange.more-unpaid', { amount: money(q.differenceMinor, props.currency) })
})
const toTill = computed(() => !!quote.value?.paid && quote.value.differenceMinor > 0)
const tillLink = computed(() => ({
  path: '/console/box-office/sell',
  query: { exchange: JSON.stringify({ orderId: props.orderId, reference: props.reference, ...body.value, expectedDifferenceMinor: quote.value?.differenceMinor ?? 0 }) },
}))

async function exchange() {
  refusal.value = null
  try {
    await $api(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/exchange`, { method: 'POST', body: body.value })
    open.value = false
    emit('exchanged')
    toast.add({ title: t('box-office.order.exchange.done'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('box-office.order.exchange.title')"
    :description="t('box-office.order.exchange.description', { reference })"
  >
    <template #body>
      <UForm
        id="box-office-exchange"
        class="space-y-4"
        :state="form"
        @submit="exchange"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="lines.length > 1"
          :label="t('box-office.order.exchange.which')"
        >
          <UCheckboxGroup
            v-model="form.lineIds"
            :items="lineItems"
          />
        </UFormField>
        <UFormField
          :label="t('box-office.order.exchange.performance')"
          required
        >
          <USelect
            v-model="form.performanceId"
            :items="performanceItems"
          />
        </UFormField>
        <UFormField
          :label="t('box-office.order.exchange.seats')"
          required
        >
          <USelect
            v-model="form.option"
            :items="optionItems"
            :disabled="!form.performanceId"
          />
        </UFormField>
        <p
          v-if="words"
          class="text-sm"
          aria-live="polite"
        >
          {{ words }}
        </p>
      </UForm>
    </template>
    <template #footer>
      <UButton
        v-if="toTill"
        :to="tillLink"
        icon="i-lucide-banknote"
        :label="t('box-office.order.exchange.to-till')"
      />
      <UButton
        v-else
        type="submit"
        form="box-office-exchange"
        :label="t('box-office.order.exchange.button')"
        :disabled="!quote"
      />
    </template>
  </UModal>
</template>
