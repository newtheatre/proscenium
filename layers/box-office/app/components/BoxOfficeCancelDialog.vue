<script setup lang="ts">
// Cancelling an order's tickets (BO-50): the seats go back on sale and tickets not yet used stop
// working at the door. A paid order may be refunded in full, less the cancellation fee, or not at
// all, for whoever may refund; a reason is needed when the tickets were paid for.
const props = defineProps<{ orderId: string, reference: string, paid: boolean, canRefund: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ cancelled: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref({ refund: 'none' as 'full' | 'less-fee' | 'none', reasonTermId: '', note: '' })

const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/box-office.cancellation-reason/terms', { key: 'box-office:cancellation-reasons', default: () => ({ terms: [] }) })
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
const refunds = computed(() => (['full', 'less-fee', 'none'] as const).map(value => ({ value, label: t(`box-office.order.cancel.refund.${value}`) })))

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  form.value = { refund: props.paid && props.canRefund ? 'full' : 'none', reasonTermId: '', note: '' }
})

async function cancel() {
  refusal.value = null
  try {
    await $api(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/cancel`, {
      method: 'POST',
      body: { refund: form.value.refund, reasonTermId: form.value.reasonTermId || undefined, note: form.value.note.trim() || undefined },
    })
    open.value = false
    emit('cancelled')
    toast.add({ title: t('box-office.order.cancel.done'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('box-office.order.cancel.title')"
    :description="t('box-office.order.cancel.description', { reference })"
  >
    <template #body>
      <UForm
        id="box-office-cancel"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ reasonTermId: paid ? form.reasonTermId : true })"
        novalidate
        @submit="cancel"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="paid && canRefund"
          :label="t('box-office.order.cancel.refund.label')"
        >
          <URadioGroup
            v-model="form.refund"
            :items="refunds"
          />
        </UFormField>
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
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="box-office-cancel"
        :label="t('box-office.order.cancel.button')"
        color="error"
      />
    </template>
  </UModal>
</template>
