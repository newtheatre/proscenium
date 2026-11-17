<!-- A fixture till panel: how many programmes, as the till's panels take their input. -->
<script setup lang="ts">
const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { amountMinor: number } | null }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()
const { t } = useT()
const count = computed({
  get: () => (props.modelValue as { count?: number } | null)?.count,
  set: n => emit('update:modelValue', n ? { count: n } : null),
})
</script>

<template>
  <UFormField :label="t('gallery.desk.amount')">
    <UInputNumber
      v-model="count"
      :min="0"
      :disabled="locked"
    />
  </UFormField>
</template>
