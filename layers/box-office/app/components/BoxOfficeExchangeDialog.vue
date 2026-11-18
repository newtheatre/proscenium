<script setup lang="ts">
// Exchanging tickets (BO-54): the chosen tickets move to another performance, seats or ticket type.
// Each ticket keeps its own seats and ticket type unless the seller changes it, so two adults and a
// child move as two adults and a child. The new seats are taken before the old ones are let go, so
// a full house changes nothing. The
// dialogue shows what it costs or gives back before anything happens. A dearer exchange of paid
// tickets goes to the till, which holds the new seats while the difference is paid.
interface Line { id: string, bandId: string | null, band: string | null, ticketTypeId: string | null, ticketType: string | null, amountMinor: number }
interface Offer { performanceId: string, title: string, startsAt: number, currency: string | null, rows: { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number }[] }
interface Quote { oldMinor: number, newMinor: number, differenceMinor: number, paid: boolean }

const props = defineProps<{ orderId: string, reference: string, currency: string, lines: Line[], performance: { id: string, title: string, startsAt: number } | null }>()
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
const form = ref({ lineIds: [] as string[], performanceId: '', options: {} as Record<string, string> })

const { data: offers } = await useAPI<{ performances: Offer[] }>('/api/box-office/desk/performances', { key: 'box-office:exchange-performances', default: () => ({ performances: [] }) })
// Performances of the same show, this one first and named as such (for other seats or another
// ticket type at the same performance), then the others in date order.
const performanceItems = computed(() => {
  const here = props.performance
  const same = (offers.value?.performances ?? []).filter(p => !here || p.title === here.title)
  return [...same].sort((a, b) => Number(b.performanceId === here?.id) - Number(a.performanceId === here?.id))
    .map(p => ({ value: p.performanceId, label: p.performanceId === here?.id ? t('box-office.order.exchange.this-performance', { when: dateTime(p.startsAt) }) : t('box-office.order.exchange.performance-option', { title: p.title, when: dateTime(p.startsAt) }) }))
})
const rows = computed(() => offers.value?.performances.find(p => p.performanceId === form.value.performanceId)?.rows ?? [])
const optionItems = computed(() => rows.value
  .map(r => ({ value: `${r.bandId}|${r.ticketTypeId}`, label: t('box-office.order.exchange.option', { band: r.band, type: r.ticketType, price: money(r.amountMinor, props.currency), free: r.free }), disabled: r.free < 1 })))
// Each ticket is named by its place on the order as well, so three alike tickets read apart.
const describe = (l: Line) => t('box-office.order.exchange.line', { number: props.lines.indexOf(l) + 1, band: l.band ?? '', type: l.ticketType ?? '', price: money(l.amountMinor, props.currency) })
const lineItems = computed(() => props.lines.map(l => ({ value: l.id, label: describe(l) })))
const chosen = computed(() => props.lines.filter(l => form.value.lineIds.includes(l.id)))
const body = computed(() => ({
  performanceId: form.value.performanceId,
  lines: chosen.value.map((l) => {
    const [bandId, ticketTypeId] = (form.value.options[l.id] ?? '').split('|')
    return { lineId: l.id, bandId: bandId ?? '', ticketTypeId: ticketTypeId ?? '' }
  }),
}))
const ready = computed(() => chosen.value.length > 0 && !!form.value.performanceId && chosen.value.every(l => !!form.value.options[l.id]))

// Each ticket starts as what it is now: the same seats and ticket type where the new performance
// sells them, else the same ticket type in any seats, else nothing until the seller picks.
function startingOption(l: Line): string {
  const free = rows.value.filter(r => r.free > 0)
  const same = free.find(r => r.bandId === l.bandId && r.ticketTypeId === l.ticketTypeId) ?? free.find(r => r.ticketTypeId === l.ticketTypeId)
  return same ? `${same.bandId}|${same.ticketTypeId}` : ''
}

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  quote.value = null
  form.value = { lineIds: props.lines.map(l => l.id), performanceId: '', options: {} }
})
watch(() => form.value.performanceId, () => {
  form.value.options = Object.fromEntries(props.lines.map(l => [l.id, startingOption(l)]))
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
        novalidate
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
        <fieldset
          v-if="form.performanceId && chosen.length"
          class="space-y-3"
        >
          <legend class="mb-2 text-sm font-medium">
            {{ t('box-office.order.exchange.seats') }}
          </legend>
          <UFormField
            v-for="l in chosen"
            :key="l.id"
            :label="describe(l)"
            required
          >
            <USelect
              v-model="form.options[l.id]"
              :items="optionItems"
              :placeholder="t('box-office.order.exchange.choose')"
            />
          </UFormField>
        </fieldset>
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
