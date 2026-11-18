<!-- The fields of an award type, shared by the new-type window and the type's own page: its name
     and address, what it recognises, and its three rules. -->
<script setup lang="ts">
export interface TypeForm { name: string, key: string, summary: string, givesTicketBenefit: boolean, onePerPerson: boolean, defaultVisibility: 'public' | 'members' | 'hidden' }

const form = defineModel<TypeForm>({ required: true })
defineProps<{ keyFixed?: boolean, keyError?: string }>()
const emit = defineEmits<{ keyTouched: [] }>()
const { t } = useT()
const visibilities = computed(() => (['public', 'members', 'hidden'] as const).map(v => ({ value: v, label: t(`awards.screens.visibility.${v}`) })))
</script>

<template>
  <UFormField
    name="name"
    :label="t('awards.screens.type.name')"
    :help="t('awards.screens.type.name-help')"
    required
  >
    <UInput
      v-model="form.name"
      maxlength="80"
    />
  </UFormField>
  <UFormField
    name="key"
    :label="t('awards.screens.type.key')"
    :help="keyFixed ? t('awards.screens.type.key-fixed') : t('awards.screens.type.key-help')"
    required
    :error="keyError"
  >
    <UInput
      v-model="form.key"
      maxlength="60"
      class="font-mono"
      :disabled="keyFixed"
      @update:model-value="emit('keyTouched')"
    />
  </UFormField>
  <UFormField
    name="summary"
    :label="t('awards.screens.type.summary')"
    :help="t('awards.screens.type.summary-help')"
  >
    <UTextarea
      v-model="form.summary"
      :rows="2"
      maxlength="500"
    />
  </UFormField>
  <USwitch
    v-model="form.givesTicketBenefit"
    :label="t('awards.screens.type.ticket-benefit')"
    :description="t('awards.screens.type.ticket-benefit-help')"
  />
  <USwitch
    v-model="form.onePerPerson"
    :label="t('awards.screens.type.one-per-person')"
    :description="t('awards.screens.type.one-per-person-help')"
  />
  <UFormField
    name="defaultVisibility"
    :label="t('awards.screens.type.default-visibility')"
    :help="t('awards.screens.type.default-visibility-help')"
  >
    <USelect
      v-model="form.defaultVisibility"
      :items="visibilities"
    />
  </UFormField>
</template>
