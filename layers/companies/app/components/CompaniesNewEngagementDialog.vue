<!-- New engagement (rule E1): its kind, and either the production it is for or a title. It opens in
     enquiry, and its page opens next. A production already engaged refuses, naming the company (E6). -->
<script setup lang="ts">
import { ENGAGEMENT_KINDS } from '../../shared/companies'
import type { EngagementKind } from '../../shared/companies'

const props = defineProps<{ companyId: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive<{ kind: EngagementKind, title: string, production: { id: string, label: string } | undefined }>({ kind: 'visiting', title: '', production: undefined })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const kinds = ENGAGEMENT_KINDS.map(value => ({ value, label: t(`companies.kinds.${value}`) }))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  Object.assign(form, { kind: 'visiting', title: '', production: undefined })
})

async function submit() {
  refusal.value = null
  try {
    const { engagementId } = await $api<{ engagementId: string }>(`/api/companies/${props.companyId}/engagements` as string, {
      method: 'POST',
      body: { kind: form.kind, title: form.title || undefined, productionId: form.production?.id },
    })
    open.value = false
    await navigateTo(`/console/companies/engagements/${engagementId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formRef.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('companies.engagements.new')"
    :description="t('companies.engagements.new-description')"
  >
    <template #body>
      <UForm
        id="engagement-new"
        ref="formEl"
        :state="form"
        :validate="() => form.production ? [] : needs({ title: form.title })"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="kind"
          :label="t('companies.field.kind')"
          required
        >
          <USelect
            v-model="form.kind"
            :items="kinds"
          />
        </UFormField>
        <UFormField
          name="productionId"
          :label="t('companies.field.production')"
          :help="t('companies.field.production-help')"
        >
          <CompaniesProductionPicker
            v-model="form.production"
            :placeholder="t('companies.field.search-productions')"
          />
        </UFormField>
        <UFormField
          name="title"
          :label="t('companies.field.title')"
          :help="t('companies.field.title-help')"
          :required="!form.production"
        >
          <UInput
            v-model="form.title"
            maxlength="160"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="engagement-new"
        :label="t('companies.engagements.open')"
      />
    </template>
  </UModal>
</template>
