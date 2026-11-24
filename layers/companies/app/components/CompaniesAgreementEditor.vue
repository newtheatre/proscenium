<!-- New terms for an engagement (CO-18, CO-22, rule A1): the deal type first, then only its own fields,
     guest places, deadlines and clauses. Saving writes the next version as a draft; nothing is sent yet. -->
<script setup lang="ts">
import { DEAL_TYPES, HIRE_FEE_BASES, SHARE_BASES } from '../../shared/companies'
import type { AgreementVersion } from '../../shared/views'

const props = defineProps<{ engagementId: string, currency: string, from: AgreementVersion | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')

type Deal = AgreementVersion['dealType']
const blank = () => ({ dealType: 'split' as Deal, sharePercent: null as number | null, shareBasis: 'net-of-fees' as NonNullable<AgreementVersion['shareBasis']>, guaranteeMinor: null as number | null, hireFeeMinor: null as number | null, hireFeeBasis: 'flat' as NonNullable<AgreementVersion['hireFeeBasis']>, depositMinor: 0 as number | null, guestPlaces: null as number | null, guestNamesDue: null as number | null, settleWithin: null as number | null, clauses: '' })
const form = reactive(blank())
const dealItems = DEAL_TYPES.map(value => ({ value, label: t(`companies.agreements.deal.${value}`) }))
const basisItems = SHARE_BASES.map(value => ({ value, label: t(`companies.agreements.basis.${value}`) }))
const feeItems = HIRE_FEE_BASES.map(value => ({ value, label: t(`companies.agreements.fee-basis.${value}`) }))
const split = computed(() => ['split', 'guarantee-or-split'].includes(form.dealType))
const guarantee = computed(() => ['guarantee', 'guarantee-or-split'].includes(form.dealType))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const v = props.from
  Object.assign(form, blank(), v
    ? { dealType: v.dealType, sharePercent: v.companyShareBp === null ? null : v.companyShareBp / 100, shareBasis: v.shareBasis ?? 'net-of-fees', guaranteeMinor: v.guaranteeMinor, hireFeeMinor: v.hireFeeMinor, hireFeeBasis: v.hireFeeBasis ?? 'flat', depositMinor: v.depositMinor, guestPlaces: v.guestPlaces, guestNamesDue: v.guestNamesDue, settleWithin: v.settleWithin, clauses: v.clauses ?? '' }
    : {})
})

const body = () => ({
  dealType: form.dealType,
  companyShareBp: split.value && form.sharePercent !== null ? Math.round(form.sharePercent * 100) : null, // not-policy: percent to basis points
  shareBasis: split.value ? form.shareBasis : null,
  guaranteeMinor: guarantee.value ? form.guaranteeMinor : null,
  hireFeeMinor: form.dealType === 'hire' ? form.hireFeeMinor : null,
  hireFeeBasis: form.dealType === 'hire' ? form.hireFeeBasis : null,
  depositMinor: form.depositMinor ?? 0,
  ...form.guestPlaces === null ? {} : { guestPlaces: form.guestPlaces },
  ...form.guestNamesDue === null ? {} : { guestNamesDue: form.guestNamesDue },
  ...form.settleWithin === null ? {} : { settleWithin: form.settleWithin },
  ...form.clauses ? { clauses: form.clauses } : {},
})
async function submit() {
  refusal.value = null
  try {
    await $api(`/api/companies/engagements/${props.engagementId}/agreements` as string, { method: 'POST', body: body() })
    open.value = false
    emit('saved')
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
    :title="from ? t('companies.agreements.change-terms') : t('companies.agreements.new')"
    :description="t('companies.agreements.editor-description')"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm
        id="agreement-terms"
        ref="formEl"
        :state="form"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <FieldGroup
          :title="t('companies.agreements.section.deal')"
          first
        >
          <UFormField
            name="dealType"
            :label="t('companies.agreements.field.deal-type')"
            required
          >
            <USelect
              v-model="form.dealType"
              :items="dealItems"
            />
          </UFormField>
          <template v-if="split">
            <UFormField
              name="companyShareBp"
              :label="t('companies.agreements.field.share')"
              :help="t('companies.agreements.field.share-help')"
              required
            >
              <FieldNumber
                v-model="form.sharePercent"
                :min="0"
                :max="100"
                :step="0.5"
              />
            </UFormField>
            <UFormField
              name="shareBasis"
              :label="t('companies.agreements.field.basis')"
              required
            >
              <USelect
                v-model="form.shareBasis"
                :items="basisItems"
              />
            </UFormField>
          </template>
          <UFormField
            v-if="guarantee"
            name="guaranteeMinor"
            :label="t('companies.agreements.field.guarantee')"
            required
          >
            <FieldMoney
              v-model="form.guaranteeMinor"
              :currency="currency"
            />
          </UFormField>
          <template v-if="form.dealType === 'hire'">
            <UFormField
              name="hireFeeMinor"
              :label="t('companies.agreements.field.fee')"
              required
            >
              <FieldMoney
                v-model="form.hireFeeMinor"
                :currency="currency"
              />
            </UFormField>
            <UFormField
              name="hireFeeBasis"
              :label="t('companies.agreements.field.fee-basis')"
              required
            >
              <USelect
                v-model="form.hireFeeBasis"
                :items="feeItems"
              />
            </UFormField>
          </template>
          <UFormField
            name="depositMinor"
            :label="t('companies.agreements.field.deposit')"
          >
            <FieldMoney
              v-model="form.depositMinor"
              :currency="currency"
            />
          </UFormField>
        </FieldGroup>
        <FieldGroup :title="t('companies.agreements.section.guests')">
          <UFormField
            name="guestPlaces"
            :label="t('companies.agreements.field.guest-places')"
            :help="t('companies.agreements.field.guest-places-help')"
          >
            <FieldNumber
              v-model="form.guestPlaces"
              :min="0"
              :max="50"
            />
          </UFormField>
          <UFormField
            name="guestNamesDue"
            :label="t('companies.agreements.field.names-due')"
            :help="t('companies.agreements.field.names-due-help')"
          >
            <DurationInput
              v-model="form.guestNamesDue"
              min="1h"
              max="14d"
              :label="t('companies.agreements.field.names-due')"
            />
          </UFormField>
          <UFormField
            name="settleWithin"
            :label="t('companies.agreements.field.settle-within')"
            :help="t('companies.agreements.field.settle-within-help')"
          >
            <DurationInput
              v-model="form.settleWithin"
              min="1d"
              max="90d"
              :label="t('companies.agreements.field.settle-within')"
            />
          </UFormField>
        </FieldGroup>
        <FieldGroup :title="t('companies.agreements.section.clauses')">
          <UFormField
            name="clauses"
            :label="t('companies.agreements.field.clauses')"
            :help="t('companies.agreements.field.clauses-help')"
          >
            <UTextarea
              v-model="form.clauses"
              :rows="6"
              maxlength="20000"
            />
          </UFormField>
        </FieldGroup>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="agreement-terms"
        :label="t('companies.agreements.save-draft')"
      />
    </template>
  </UModal>
</template>
