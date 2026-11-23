<!-- One What's on filter: a native select, so it submits with its form when scripts are off (C-38).
     Inline in the toolbar it carries its label inside the control; `stacked` puts it above, for the sheet. -->
<script setup lang="ts">
const props = defineProps<{
  name: string
  label: string
  any: string
  options: { value: string, label: string }[]
  value?: string
  stacked?: boolean
}>()
const emit = defineEmits<{ pick: [value: string] }>()
const id = useId()
const chosen = computed(() => !!props.value)
</script>

<template>
  <div :class="stacked ? 'flex flex-col gap-1.5' : 'relative flex h-9 items-center rounded-md bg-default ring ring-inset focus-within:ring-2 focus-within:ring-primary ' + (chosen ? 'ring-2 ring-inverted' : 'ring-accented')">
    <label
      :for="id"
      :class="stacked ? 'text-sm font-medium text-highlighted' : 'ps-2.5 text-sm text-muted'"
    >{{ label }}</label>
    <div class="relative flex items-center">
      <select
        :id="id"
        :name="name"
        :class="stacked
          ? 'h-11 w-full appearance-none rounded-md bg-default ps-3 pe-9 text-base text-highlighted ring ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' + (chosen ? 'ring-2 ring-inverted font-medium' : 'ring-accented')
          : 'h-9 appearance-none bg-transparent ps-1.5 pe-8 text-sm font-medium text-highlighted focus-visible:outline-none'"
        @change="emit('pick', ($event.target as HTMLSelectElement).value)"
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
      <UIcon
        name="i-lucide-chevron-down"
        class="pointer-events-none absolute end-2.5 size-4 text-muted"
      />
    </div>
  </div>
</template>
