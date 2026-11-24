<!-- Give (P3, FR-07): an amount from the buttons or typed within the limits, a fund where the theatre
     offers a choice (or the campaign the page was opened from), who is giving, then the card. Nothing
     is chosen for the donor. Signed in, the gift is on their account; otherwise they give an email. -->
<script setup lang="ts">
definePageMeta({ key: 'fundraising-give' })
const { t } = useT()
const { money } = useMoneyText()
useSeoMeta({ title: () => t('fundraising.give.title') })
const { options, campaign, mayShowAmount, fund, purpose, form, challenge, refusal, card, token, choose, validate, give, signedIn } = await useGive()
const { data, status, error, refresh } = options
const formEl = useFormRef('formEl')
const fundItems = computed(() => (data.value?.funds ?? []).map(f => ({ value: f.id, label: f.name })))
const total = computed(() => form.amountMinor && data.value ? money(form.amountMinor, data.value.currency) : '')
const returnUrl = ref('')
watch(token, (link) => {
  if (link) returnUrl.value = `${window.location.origin}/support/thanks/${link}`
})
</script>

<template>
  <PageFrame
    :title="campaign ? t('fundraising.give.title-campaign', { campaign: campaign.title }) : t('fundraising.give.title')"
    :description="t('fundraising.give.help')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <p
          v-if="!loaded.online"
          class="text-muted"
        >
          {{ t('fundraising.give.no-online') }}
        </p>
        <UAlert
          v-else-if="campaign && !campaign.open"
          color="info"
          variant="subtle"
          :title="t('fundraising.support.closed')"
          :actions="[{ label: t('fundraising.support.give-to', { fund: campaign.fund.name }), to: `/support/give?fund=${campaign.fund.id}` }]"
        />
        <div
          v-else-if="card"
          class="space-y-4"
        >
          <p>{{ t('fundraising.give.paying', { amount: total, fund: fund?.name ?? '' }) }}</p>
          <RefusalNotice :refusal="refusal" />
          <PaymentsCardForm
            :next="card"
            :label="t('fundraising.give.button', { amount: total })"
            :return-url="returnUrl"
            @submitted="navigateTo(`/support/thanks/${token}`)"
          />
        </div>
        <UForm
          v-else
          ref="formEl"
          :state="form"
          :validate="validate"
          class="space-y-6"
          novalidate
          @submit="give(errors => formEl?.setErrors(errors))"
        >
          <RefusalNotice :refusal="refusal" />
          <FundraisingAmountChoice
            v-model="form.amountMinor"
            v-model:other="form.other"
            :options="loaded"
            @choose="choose"
          />
          <UFormField
            v-if="!campaign && fundItems.length > 1"
            name="fundId"
            :label="t('fundraising.give.fund')"
            :help="purpose ?? undefined"
          >
            <USelect
              v-model="form.fundId"
              :items="fundItems"
              :placeholder="fund?.name"
            />
          </UFormField>
          <FundraisingDonorFields
            v-model:name="form.name"
            v-model:email="form.email"
            v-model:acknowledge-as="form.acknowledgeAs"
            v-model:message="form.message"
            :signed-in="signedIn"
          />
          <UFormField
            v-if="mayShowAmount"
            name="showAmount"
            :help="t('fundraising.give.show-amount-help')"
          >
            <UCheckbox
              v-model="form.showAmount"
              :label="t('fundraising.give.show-amount')"
            />
          </UFormField>
          <TurnstileCheck
            quiet
            @token="challenge = $event"
          />
          <UButton
            type="submit"
            size="lg"
            block
            :loading="formEl?.loading"
            :label="total ? t('fundraising.give.button', { amount: total }) : t('fundraising.give.button-empty')"
          />
        </UForm>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
