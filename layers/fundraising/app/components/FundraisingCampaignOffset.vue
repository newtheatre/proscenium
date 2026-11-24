<!-- Money a campaign raised outside the platform, added to its total (K1), and where it came from. -->
<script setup lang="ts">
const amount = defineModel<number | null>('amount', { required: true })
const note = defineModel<string>('note', { required: true })
const { t } = useT()
</script>

<template>
  <UFormField
    name="offsetMinor"
    :label="t('fundraising.campaign.offset')"
    :help="t('fundraising.campaign.offset-help')"
  >
    <FieldMoney v-model="amount" />
  </UFormField>
  <UFormField
    v-if="amount"
    name="offsetNote"
    :label="t('fundraising.campaign.offset-note-label')"
    required
  >
    <UInput
      v-model="note"
      maxlength="200"
    />
  </UFormField>
</template>
