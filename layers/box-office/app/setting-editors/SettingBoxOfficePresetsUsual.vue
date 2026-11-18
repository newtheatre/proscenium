<!-- The editor for box-office.presets.usual: the ticket preset a new show starts from in a space with
     no usual preset of its own. None leaves the setting unset. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })
const { t } = useT()
const NONE = '__none'
const { data } = useAPI<{ rows: { id: string, name: string }[] }>('/api/box-office/ticket-presets', { key: 'box-office:ticket-presets', lazy: true, server: false })
const items = computed(() => [{ value: NONE, label: t('box-office.presets.none') }, ...(data.value?.rows ?? []).map(p => ({ value: p.id, label: p.name }))])
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <USelect
      :model-value="model || NONE"
      :items="items"
      :disabled="disabled"
      class="w-72"
      @update:model-value="model = $event === NONE ? null : String($event)"
    />
    <UButton
      to="/admin/modules/box-office/ticket-presets"
      :label="t('box-office.presets.manage')"
      color="neutral"
      variant="link"
      size="sm"
    />
  </div>
</template>
