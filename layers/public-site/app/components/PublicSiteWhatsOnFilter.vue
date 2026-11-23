<!-- One What's on filter. A Nuxt UI select, its label inside the control in the toolbar and above it
     when `stacked` (the phone sheet). `native` is the scripts-off fallback: a plain select that submits with its GET form (C-38). -->
<script setup lang="ts">
const props = defineProps<{
  name: string
  label: string
  any: string
  options: { value: string, label: string }[]
  value?: string
  stacked?: boolean
  native?: boolean
}>()
const emit = defineEmits<{ pick: [value: string] }>()
const id = useId()
// A select cannot hold an empty value, so "any" stands for none.
const ANY = '__any'
const items = computed(() => [{ value: ANY, label: props.any }, ...props.options])
const chosen = computed(() => props.value ?? ANY)
const pick = (value: unknown) => emit('pick', value === ANY ? '' : String(value))
</script>

<template>
  <div
    v-if="native"
    class="flex items-center gap-1.5"
  >
    <label
      :for="id"
      class="text-sm text-muted"
    >{{ label }}</label>
    <select
      :id="id"
      :name="name"
      class="h-8 rounded-md bg-default px-2 text-sm text-highlighted ring ring-inset ring-accented"
    >
      <option
        value=""
        :selected="!value"
      >
        {{ any }}
      </option>
      <option
        v-for="o in options"
        :key="o.value"
        :value="o.value"
        :selected="value === o.value"
      >
        {{ o.label }}
      </option>
    </select>
  </div>
  <UFormField
    v-else-if="stacked"
    :label="label"
    size="lg"
  >
    <USelect
      :model-value="chosen"
      :items="items"
      color="neutral"
      :highlight="!!value"
      @update:model-value="pick"
    />
  </UFormField>
  <USelect
    v-else
    :model-value="chosen"
    :items="items"
    :aria-label="label"
    color="neutral"
    :highlight="!!value"
    :content="{ align: 'end' }"
    class="w-auto"
    @update:model-value="pick"
  >
    <span class="truncate"><span class="text-muted">{{ label }}</span> <span class="font-medium text-highlighted">{{ items.find(i => i.value === chosen)?.label }}</span></span>
  </USelect>
</template>
