<!-- A new fund, or a change to one: its name, what it is for, whether gifts to it are restricted to
     that, and whether donors may choose it. Restricted needs a purpose (FR-05). -->
<script setup lang="ts">
interface Fund { id: string, name: string, purpose: string | null, restricted: boolean, offered: boolean, received: boolean }

/** undefined: closed; null: a new fund. */
const props = defineProps<{ fund: Fund | null | undefined }>()
const emit = defineEmits<{ close: [], saved: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const formEl = useFormRef('formEl')
const form = reactive({ name: '', purpose: '', restricted: false, offered: true })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const open = computed({ get: () => props.fund !== undefined, set: (v) => { if (!v) emit('close') } })
let idempotency = ''
watch(() => props.fund, (f) => {
  if (f === undefined) return
  Object.assign(form, { name: f?.name ?? '', purpose: f?.purpose ?? '', restricted: f?.restricted ?? false, offered: f?.offered ?? true })
  refusal.value = null
  idempotency = crypto.randomUUID()
})
function validate() {
  return [...needs({ name: form.name }), ...(form.restricted && !form.purpose.trim() ? [{ name: 'purpose', message: t('fundraising.funds.purpose-needed') }] : [])]
}
async function save() {
  refusal.value = null
  const body = { name: form.name.trim(), purpose: form.purpose.trim() || null, restricted: form.restricted, offered: form.offered }
  try {
    if (props.fund) await $api(`/api/fundraising/funds/${props.fund.id}` as string, { method: 'PATCH', body })
    else await $api('/api/fundraising/funds', { method: 'POST', headers: { 'idempotency-key': idempotency }, body })
    toast.add({ title: t('fundraising.funds.saved'), color: 'success' })
    emit('saved')
    emit('close')
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
    :title="t(fund ? 'fundraising.funds.edit' : 'fundraising.funds.new')"
  >
    <template #body>
      <UForm
        id="fundraising-fund"
        ref="formEl"
        :state="form"
        :validate="validate"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('fundraising.funds.name')"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="purpose"
          :label="t('fundraising.funds.purpose')"
          :help="t('fundraising.funds.purpose-help')"
          :required="form.restricted"
        >
          <UTextarea
            v-model="form.purpose"
            maxlength="500"
            :rows="2"
          />
        </UFormField>
        <UFormField
          name="restricted"
          :help="fund?.received ? t('fundraising.funds.restricted-fixed') : t('fundraising.funds.restricted-help')"
        >
          <UCheckbox
            v-model="form.restricted"
            :label="t('fundraising.funds.restricted-label')"
            :disabled="fund?.received"
          />
        </UFormField>
        <UFormField
          name="offered"
          :help="t('fundraising.funds.offered-help')"
        >
          <UCheckbox
            v-model="form.offered"
            :label="t('fundraising.funds.offered-label')"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="fundraising-fund"
        :loading="formEl?.loading"
        :label="t('fundraising.funds.save')"
      />
    </template>
  </UModal>
</template>
