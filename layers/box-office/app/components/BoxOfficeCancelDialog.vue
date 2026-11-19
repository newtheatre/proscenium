<script setup lang="ts">
// Cancelling an order's tickets (BO-50): the seats go back on sale and tickets not yet used stop
// working at the door. A paid order may be refunded in full, less the cancellation fee, or not at
// all, for whoever may refund; a reason is needed when the tickets were paid for. Each ticket can
// be ticked or left out. One already used at the door starts unticked and, if ticked, stays admitted
// (a duplicate booking scanned by mistake). The buyer can be left unemailed. The refund shown is for
// what is ticked.
interface Line { id: string, band: string | null, ticketType: string | null, amountMinor: number, admittedAt: number | null }

const props = defineProps<{ orderId: string, reference: string, paid: boolean, canRefund: boolean, currency: string, feeMinor: number, lines: Line[], hasBuyer: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ cancelled: [result: { refund: { state: string, amountMinor: number } | null }] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { money } = await useMoney()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref({ lineIds: [] as string[], refund: 'none' as 'full' | 'less-fee' | 'none', reasonTermId: '', note: '', quiet: false })

const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/box-office.cancellation-reason/terms', { key: 'box-office:cancellation-reasons', default: () => ({ terms: [] }) })
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
const refunds = computed(() => (['full', 'less-fee', 'none'] as const).map(value => ({ value, label: t(`box-office.order.cancel.refund.${value}`) })))

// A ticket used at the door is left out unless ticked; only a paid one is checked at the door.
const used = (l: Line) => props.paid && !!l.admittedAt
const lineItems = computed(() => props.lines.map((l, i) => ({
  value: l.id,
  label: t('box-office.order.cancel.line', { number: i + 1, band: l.band ?? '', type: l.ticketType ?? '', price: money(l.amountMinor, props.currency) }),
  description: used(l) ? t('box-office.order.cancel.line-used') : undefined,
})))
const usedChosen = computed(() => props.lines.some(l => used(l) && form.value.lineIds.includes(l.id)))
const chosen = computed(() => props.lines.filter(l => form.value.lineIds.includes(l.id)))
const refundMinor = computed(() => {
  if (!props.paid || form.value.refund === 'none') return 0
  const fee = form.value.refund === 'less-fee' ? props.feeMinor : 0
  return chosen.value.reduce((sum, l) => sum + l.amountMinor - Math.min(fee, l.amountMinor), 0)
})
const refundWords = computed(() => props.paid && props.canRefund && chosen.value.length
  ? t('box-office.order.cancel.refund.amount', { amount: money(refundMinor.value, props.currency), count: chosen.value.length })
  : '')

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  form.value = { lineIds: props.lines.filter(l => !used(l)).map(l => l.id), refund: props.paid && props.canRefund ? 'full' : 'none', reasonTermId: '', note: '', quiet: false }
})

async function cancel() {
  refusal.value = null
  try {
    const result = await $api<{ refund: { state: string, amountMinor: number } | null }>(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/cancel`, {
      method: 'POST',
      body: { lineIds: form.value.lineIds, refund: form.value.refund, reasonTermId: form.value.reasonTermId || undefined, note: form.value.note.trim() || undefined, quiet: form.value.quiet || undefined, admitted: usedChosen.value || undefined },
    })
    open.value = false
    emit('cancelled', { refund: result?.refund ?? null })
    // Say what happens to the money, so a refund waiting for approval is not missed.
    const refund = result?.refund
    const amount = refund ? money(refund.amountMinor, props.currency) : ''
    toast.add({
      title: t(props.paid ? 'box-office.order.cancel.done' : 'box-office.order.cancel.reservation-done'),
      description: refund ? t(refund.state === 'requested' ? 'box-office.order.cancel.refund-waiting' : 'box-office.order.cancel.refund-approved', { amount }) : undefined,
      color: 'success',
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(paid ? 'box-office.order.cancel.title' : 'box-office.order.cancel.reservation-title')"
    :description="t(paid ? 'box-office.order.cancel.description' : 'box-office.order.cancel.reservation-description', { reference })"
  >
    <template #body>
      <UForm
        id="box-office-cancel"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ lineIds: form.lineIds, reasonTermId: paid ? form.reasonTermId : true })"
        novalidate
        @submit="cancel"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="lines.length > 1 || lines.some(used)"
          name="lineIds"
          required
        >
          <UCheckboxGroup
            v-model="form.lineIds"
            :legend="t('box-office.order.cancel.which')"
            :items="lineItems"
          />
        </UFormField>
        <p
          v-if="usedChosen"
          class="text-sm text-muted"
          aria-live="polite"
        >
          {{ t('box-office.order.cancel.used-chosen') }}
        </p>
        <UFormField
          v-if="paid && canRefund"
          :label="t('box-office.order.cancel.refund.label')"
        >
          <URadioGroup
            v-model="form.refund"
            :items="refunds"
          />
        </UFormField>
        <p
          v-if="refundWords"
          class="text-sm"
          aria-live="polite"
        >
          {{ refundWords }}
        </p>
        <UFormField
          name="reasonTermId"
          :label="t('box-office.order.cancel.reason')"
          :required="paid"
        >
          <USelect
            v-model="form.reasonTermId"
            :items="reasonItems"
            :placeholder="t('box-office.order.cancel.reason-placeholder')"
          />
        </UFormField>
        <UFormField
          :label="t('box-office.order.cancel.note')"
          :help="t('box-office.order.cancel.note-help')"
        >
          <UTextarea
            v-model="form.note"
            :rows="2"
            maxlength="200"
          />
        </UFormField>
        <UCheckbox
          v-if="hasBuyer"
          v-model="form.quiet"
          :label="t('box-office.order.cancel.quiet')"
          :description="t('box-office.order.cancel.quiet-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="box-office-cancel"
        :label="t(paid ? 'box-office.order.cancel.button' : 'box-office.order.cancel.reservation-title')"
        color="error"
      />
    </template>
  </UModal>
</template>
