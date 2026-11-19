<!-- Gives a booking nobody owns to a person (Matt, 19 November): found by name or address, or an
     address typed in. Nobody is emailed unless asked, and only a paid booking's tickets can be sent. -->
<script setup lang="ts">
import type { Buyer } from './BoxOfficeBuyerPicker.vue'

const props = defineProps<{ orderId: string, reference: string, paid: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ assigned: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref<{ buyer: Buyer | undefined, send: boolean }>({ buyer: undefined, send: false })

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  form.value = { buyer: undefined, send: false }
})

async function assign() {
  const buyer = form.value.buyer
  if (!buyer) return
  refusal.value = null
  try {
    const result = await $api<{ buyer: string, sent: boolean }>(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/assign`, {
      method: 'POST',
      body: { ...('accountId' in buyer ? { accountId: buyer.accountId } : { email: buyer.email }), send: props.paid && form.value.send },
    })
    open.value = false
    emit('assigned')
    toast.add({ title: t(result.sent ? 'box-office.order.assign.done-sent' : 'box-office.order.assign.done', { name: result.buyer }), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('box-office.order.assign.title')"
    :description="t('box-office.order.assign.description', { reference })"
  >
    <template #body>
      <UForm
        id="box-office-assign"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ buyer: form.buyer })"
        novalidate
        @submit="assign"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="buyer"
          :label="t('box-office.order.assign.who')"
          required
        >
          <BoxOfficeBuyerPicker
            v-model="form.buyer"
            :domains="[]"
            :placeholder="t('box-office.order.assign.placeholder')"
          />
        </UFormField>
        <UCheckbox
          v-if="paid"
          v-model="form.send"
          :label="t('box-office.order.assign.send')"
          :description="t('box-office.order.assign.send-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="box-office-assign"
        :label="t('box-office.order.assign.button')"
      />
    </template>
  </UModal>
</template>
