<!-- Sending a bill back (IE-20): the reason is required, and whoever logged it reads it on the bill. -->
<script setup lang="ts">
const props = defineProps<{ /** Sends it back; a refusal it throws is shown here. */ send: (note: string) => Promise<void> }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useT()
const { toRefusal, fieldErrors } = useRefusal()
const form = reactive({ note: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  form.note = ''
  refusal.value = null
})

async function save() {
  refusal.value = null
  try {
    await props.send(form.note.trim())
    open.value = false
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('invoicing.screens.bill.return')"
    :description="t('invoicing.screens.bill.return-help')"
  >
    <template #body>
      <UForm
        id="invoicing-bill-return"
        ref="formEl"
        :state="form"
        :validate="() => needs({ note: form.note.trim() })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="note"
          :label="t('invoicing.screens.bill.return-note')"
          required
        >
          <UTextarea
            v-model="form.note"
            :rows="3"
            maxlength="500"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="invoicing-bill-return"
        :label="t('invoicing.screens.bill.return')"
      />
    </template>
  </UModal>
</template>
