<!-- What a reference list's checkout field says and what a well-formed reference looks like (V13,
     V15). Never a free pattern: digits, or letters and digits, with a length. -->
<script setup lang="ts">
defineProps<{ labelError?: string }>()
const label = defineModel<string>('label', { required: true })
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
      :label="t('membership.screens.list.shape')"
      :help="t('membership.screens.list.shape-help')"
    >
      <div class="flex flex-wrap items-end gap-3">
        <USelect
          v-model="kind"
          :items="(['digits', 'letters-and-digits'] as const).map(v => ({ value: v, label: t(`membership.screens.list.shapes.${v}`) }))"
          class="w-48"
        />
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
    </UFormField>
  </div>
</template>
