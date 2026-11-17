<!-- The show an award is for and the committee's decision: shared by issuing and correcting. -->
<script setup lang="ts">
const productionId = defineModel<string | null>('productionId', { default: null })
const decidedOn = defineModel<string>('decidedOn', { default: '' })
const decisionNote = defineModel<string>('decisionNote', { default: '' })
const { t } = useT()
</script>

<template>
  <UFormField
    name="productionId"
    :label="t('awards.screens.award.production')"
    :help="t('awards.screens.award.production-help')"
  >
    <FieldRecord
      v-model="productionId"
      record="core.production"
    />
  </UFormField>
  <UFormField
    name="decidedOn"
    :label="t('awards.screens.award.decided-on')"
  >
    <FieldDate v-model="decidedOn" />
  </UFormField>
  <UFormField
    name="decisionNote"
    :label="t('awards.screens.award.decision-note')"
    :help="t('awards.screens.award.decision-note-help')"
  >
    <UInput
      v-model="decisionNote"
      maxlength="500"
    />
  </UFormField>
</template>
