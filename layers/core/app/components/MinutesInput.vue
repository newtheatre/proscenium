<!-- A length in whole minutes, entered as a number of minutes or hours (run presets, Matt 2026-11-17).
     Empty, it shows greyed the value it will take, so no "left empty" hint is needed. -->
<script setup lang="ts">
const props = defineProps<{
  /** What an empty field stands for, in minutes. */
  placeholder?: number | null
  min?: number
  max?: number
  disabled?: boolean
  label?: string
}>()
const model = defineModel<number | null>({ default: null })
const seconds = computed({
  get: () => model.value === null ? null : model.value * 60, // not-policy: seconds in a minute
  set: (v: number | null | undefined) => { model.value = v === null || v === undefined ? null : Math.round(v / 60) }, // not-policy: seconds in a minute
})
</script>

<template>
  <DurationInput
    v-model="seconds"
    :min="(props.min ?? 0) * 60"
    :max="(props.max ?? 1439) * 60"
    :units="['hour', 'minute']"
    :placeholder="props.placeholder === null || props.placeholder === undefined ? null : props.placeholder * 60"
    :disabled="disabled"
    :label="label"
  />
</template>
