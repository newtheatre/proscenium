<!-- Choosing a tax code for something sold (FIN-07). With `usual`, the first choice is null: follow the
     theatre's usual code. A code no longer offered still shows while it is the one chosen. -->
<script setup lang="ts">
const props = defineProps<{ usual?: boolean, disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })
const { t } = useT()
const { data } = await useAPI<{ registered: boolean, usual: string, codes: { code: string, label: string, rateBasisPoints: number, active: boolean }[] }>('/api/finance/tax-codes/choices', { key: 'finance:tax-code-choices' })

const name = (c: { label: string, rateBasisPoints: number }) => c.rateBasisPoints ? `${c.label} (${c.rateBasisPoints / 100}%)` : c.label
const items = computed(() => {
  const codes = (data.value?.codes ?? []).filter(c => c.active || c.code === model.value)
  const usual = codes.find(c => c.code === data.value?.usual) ?? data.value?.codes.find(c => c.code === data.value?.usual)
  return [
    ...(props.usual ? [{ value: null, label: t('finance.screens.tax-code-select.usual', { code: usual ? name(usual) : data.value?.usual ?? '' }) }] : []),
    ...codes.map(c => ({ value: c.code, label: name(c) })),
  ]
})
</script>

<template>
  <USelect
    v-model="model"
    :items="items"
    :disabled="disabled"
  />
</template>
