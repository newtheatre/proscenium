<!-- A short list of amounts of money, each changed or removed in place, with a button to add one:
     the editor behind the fundraising settings that are lists of amounts. -->
<script setup lang="ts">
const props = defineProps<{ disabled?: boolean, most: number, least: number, label: (n: number) => string, removeLabel: (n: number) => string }>()
const model = defineModel<number[]>({ default: () => [] })
const { t } = useT()
function set(i: number, value: number | null) {
  const next = [...model.value]
  if (value) next[i] = value
  model.value = next
}
const add = () => { model.value = [...model.value, model.value.at(-1) ?? 100] } // not-policy: a starting amount to change
const remove = (i: number) => { model.value = model.value.filter((_, j) => j !== i) }
const removable = computed(() => model.value.length > props.least)
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
        :aria-label="label(i + 1)"
        @update:model-value="set(i, $event)"
      />
      <IconButton
        v-if="removable"
        icon="i-lucide-x"
        :label="removeLabel(i + 1)"
        :disabled="disabled"
        @click="remove(i)"
      />
    </UFieldGroup>
    <UButton
      v-if="model.length < most"
      icon="i-lucide-plus"
      color="neutral"
      variant="ghost"
      :label="t('fundraising.settings-editor.add')"
      :disabled="disabled"
      @click="add"
    />
  </div>
</template>
