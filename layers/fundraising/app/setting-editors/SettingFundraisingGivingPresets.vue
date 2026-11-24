<!-- The editor for fundraising.giving.presets: up to six amount buttons for the Give page, in the
     order they are shown. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<number[]>({ default: () => [] })
const { t } = useT()
const MOST = 6 // not-policy: the setting's own bound
function set(i: number, value: number | null) {
  const next = [...model.value]
  if (value) next[i] = value
  model.value = next
}
const add = () => { model.value = [...model.value, model.value.at(-1) ?? 100] } // not-policy: a starting amount to change
const remove = (i: number) => { model.value = model.value.filter((_, j) => j !== i) }
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UFieldGroup
      v-for="(amount, i) in model"
      :key="i"
    >
      <FieldMoney
        :model-value="amount"
        :min="1"
        :disabled="disabled"
        :aria-label="t('fundraising.settings-editor.preset', { n: i + 1 })"
        @update:model-value="set(i, $event)"
      />
      <IconButton
        v-if="model.length > 1"
        icon="i-lucide-x"
        :label="t('fundraising.settings-editor.remove', { n: i + 1 })"
        :disabled="disabled"
        @click="remove(i)"
      />
    </UFieldGroup>
    <UButton
      v-if="model.length < MOST"
      icon="i-lucide-plus"
      color="neutral"
      variant="ghost"
      :label="t('fundraising.settings-editor.add')"
      :disabled="disabled"
      @click="add"
    />
  </div>
</template>
