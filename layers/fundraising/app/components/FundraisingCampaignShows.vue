<!-- When a campaign runs and what its page shows: raised and target, whether Gift Aid counts toward
     it, and the names of donors who chose to be named, with nothing, a band or the amount beside
     each (K1, K3). An amount shows only for a donor who allowed it. -->
<script setup lang="ts">
defineProps<{ amountItems: { value: string, label: string }[] }>()
const opensAt = defineModel<number | null>('opensAt', { required: true })
const closesAt = defineModel<number | null>('closesAt', { required: true })
const showTotal = defineModel<boolean>('showTotal', { required: true })
const countGiftAid = defineModel<boolean>('countGiftAid', { required: true })
const listNames = defineModel<boolean>('listNames', { required: true })
const listAmounts = defineModel<'none' | 'band' | 'exact'>('listAmounts', { required: true })
const { t } = useT()
</script>

<template>
  <FieldGroup :title="t('fundraising.campaign.when')">
    <UFormField
      name="opensAt"
      :label="t('fundraising.campaign.opens')"
      :help="t('fundraising.campaign.opens-help')"
      required
    >
      <FieldDateTime v-model="opensAt" />
    </UFormField>
    <UFormField
      name="closesAt"
      :label="t('fundraising.campaign.closes')"
      :help="t('fundraising.campaign.closes-help')"
    >
      <FieldDateTime
        v-model="closesAt"
        :min="opensAt ?? undefined"
      />
    </UFormField>
  </FieldGroup>
  <FieldGroup :title="t('fundraising.campaign.shows')">
    <UFormField name="showTotal">
      <UCheckbox
        v-model="showTotal"
        :label="t('fundraising.campaign.show-total')"
      />
    </UFormField>
    <UFormField
      name="countGiftAid"
      :help="t('fundraising.campaign.count-gift-aid-help')"
    >
      <UCheckbox
        v-model="countGiftAid"
        :label="t('fundraising.campaign.count-gift-aid')"
      />
    </UFormField>
    <UFormField
      name="listNames"
      :help="t('fundraising.campaign.list-names-help')"
    >
      <UCheckbox
        v-model="listNames"
        :label="t('fundraising.campaign.list-names')"
      />
    </UFormField>
    <UFormField
      v-if="listNames"
      name="listAmounts"
      :label="t('fundraising.campaign.list-amounts.label')"
      :help="t('fundraising.campaign.list-amounts.help')"
    >
      <USelect
        v-model="listAmounts"
        :items="amountItems"
      />
    </UFormField>
  </FieldGroup>
</template>
