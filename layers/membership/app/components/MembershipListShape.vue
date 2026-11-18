<!-- What a reference list's checkout field says, the short noun messages use for the reference, and
     what a well-formed reference looks like (V13, V15). Never a free pattern: digits, or letters and
     digits, with a length. -->
<script setup lang="ts">
defineProps<{ labelError?: string, nounError?: string }>()
const label = defineModel<string>('label', { required: true })
const noun = defineModel<string>('noun', { required: true })
const kind = defineModel<'digits' | 'letters-and-digits'>('kind', { required: true })
const min = defineModel<number>('min', { required: true })
const max = defineModel<number>('max', { required: true })
const { t } = useT()
</script>

<template>
  <div class="space-y-4">
    <UFormField
      :label="t('membership.screens.list.label')"
      :help="t('membership.screens.list.label-help')"
      name="referenceLabel"
      :error="labelError"
      required
    >
      <UInput
        v-model="label"
        maxlength="120"
        :placeholder="t('membership.screens.list.label-placeholder')"
      />
    </UFormField>
    <UFormField
      :label="t('membership.screens.list.noun')"
      :help="t('membership.screens.list.noun-help')"
      :error="nounError"
      required
    >
      <UInput
        v-model="noun"
        maxlength="40"
        :placeholder="t('membership.screens.list.noun-placeholder')"
      />
    </UFormField>
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium text-default">
        {{ t('membership.screens.list.shape') }}
      </legend>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField :label="t('membership.screens.list.characters')">
          <USelect
            v-model="kind"
            :items="(['digits', 'letters-and-digits'] as const).map(v => ({ value: v, label: t(`membership.screens.list.shapes.${v}`) }))"
          />
        </UFormField>
        <UFormField :label="t('membership.screens.list.shortest')">
          <UInputNumber
            v-model="min"
            :min="1"
            :max="40"
          />
        </UFormField>
        <UFormField :label="t('membership.screens.list.longest')">
          <UInputNumber
            v-model="max"
            :min="1"
            :max="40"
          />
        </UFormField>
      </div>
      <p class="text-sm text-muted">
        {{ t('membership.screens.list.shape-help') }}
      </p>
    </fieldset>
  </div>
</template>
