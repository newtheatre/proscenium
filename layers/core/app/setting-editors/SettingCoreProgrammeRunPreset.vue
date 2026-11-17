<!-- The editor for core.programme.run-preset: the run preset Add a run starts from in a space with no
     usual preset of its own. None leaves the setting unset. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })
const NONE = '__none'
const { data } = useAPI<{ rows: { id: string, name: string }[] }>('/api/core/run-presets', { key: 'core:run-presets', lazy: true, server: false })
const items = computed(() => [{ value: NONE, label: 'None' }, ...(data.value?.rows ?? []).map(p => ({ value: p.id, label: p.name }))])
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <USelect
      :model-value="model ?? NONE"
      :items="items"
      :disabled="disabled"
      class="w-72"
      @update:model-value="model = $event === NONE ? null : String($event)"
    />
    <UButton
      to="/admin/modules/core/run-presets"
      label="Manage presets"
      color="neutral"
      variant="link"
      size="sm"
    />
  </div>
</template>
