<!-- Records money taken outside the site for a booking that lapsed unpaid, such as a card taken in the
     provider's own app at the door. The booking stays lapsed; the money becomes ticket income. -->
<script setup lang="ts">
const props = defineProps<{ orderId: string, reference: string, amount: string, accounts: { id: string, label: string }[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ recorded: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref<{ providerAccountId: string | undefined, note: string }>({ providerAccountId: undefined, note: '' })
const items = computed(() => props.accounts.map(a => ({ label: a.label, value: a.id })))

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  form.value = { providerAccountId: props.accounts.length === 1 ? props.accounts[0]!.id : undefined, note: '' }
})

async function submit() {
  refusal.value = null
  try {
    await $api(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/record-payment`, {
      method: 'POST',
      body: { providerAccountId: form.value.providerAccountId, note: form.value.note.trim() },
    })
    open.value = false
    emit('recorded')
    toast.add({ title: t('box-office.order.late-payment.done', { amount: props.amount }), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('box-office.order.late-payment.title')"
    :description="t('box-office.order.late-payment.description', { reference, amount })"
  >
    <template #body>
      <UForm
        id="box-office-late-payment"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ providerAccountId: form.providerAccountId, note: form.note.trim() })"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="accounts.length > 1"
          name="providerAccountId"
          :label="t('box-office.order.late-payment.account')"
          required
        >
          <USelectMenu
            v-model="form.providerAccountId"
            value-key="value"
            :items="items"
          />
        </UFormField>
        <UFormField
          name="note"
          :label="t('box-office.order.late-payment.note')"
          :help="t('box-office.order.late-payment.note-help')"
          required
        >
          <UInput
            v-model="form.note"
            maxlength="500"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="box-office-late-payment"
        :label="t('box-office.order.late-payment.button', { amount })"
      />
    </template>
  </UModal>
</template>
