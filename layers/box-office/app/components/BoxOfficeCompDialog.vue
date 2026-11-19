<script setup lang="ts">
// Making a reservation not yet paid for complimentary: every ticket on it, on the same seats, for a
// reason from the theatre's list. Where the theatre needs approval it waits for someone else to decide.
const props = defineProps<{ orderId: string, count: number, needsApproval: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ done: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref({ reasonTermId: '' })

const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/box-office.comp-reason/terms', { key: 'box-office:comp-reasons', default: () => ({ terms: [] }) })
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  form.value = { reasonTermId: '' }
})

async function submit() {
  refusal.value = null
  try {
    const result = await $api<{ issued: boolean }>(`/api/box-office/orders/${encodeURIComponent(props.orderId)}/comp`, { method: 'POST', body: { reasonTermId: form.value.reasonTermId } })
    open.value = false
    emit('done')
    toast.add({ title: t(result.issued ? 'box-office.order.comp.issued' : 'box-office.order.comp.asked'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('box-office.order.comp.title')"
    :description="t('box-office.order.comp.description', { count })"
  >
    <template #body>
      <UForm
        id="box-office-comp"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ reasonTermId: form.reasonTermId })"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <p class="text-sm text-muted">
          {{ t(needsApproval ? 'box-office.order.comp.approval' : 'box-office.order.comp.direct') }}
        </p>
        <UFormField
          name="reasonTermId"
          :label="t('box-office.order.comp.reason')"
          required
        >
          <USelect
            v-model="form.reasonTermId"
            :items="reasonItems"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="box-office-comp"
        :label="t(needsApproval ? 'box-office.order.comp.button' : 'box-office.order.comp.button-direct')"
      />
    </template>
  </UModal>
</template>
