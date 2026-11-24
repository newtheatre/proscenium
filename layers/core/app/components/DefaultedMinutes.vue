<!-- A length in minutes that takes the theatre's value until it is given its own (L25). Left to the
     theatre, it shows that value as the value, with a "Theatre default" badge and Change, so it never
     looks like a disabled box; once changed it is an ordinary field, with "Use theatre default". -->
<script setup lang="ts">
const props = defineProps<{
  /** The theatre's value, in minutes, that an empty one takes. */
  fallback?: number | null
  min?: number
  max?: number
  label: string
}>()
const model = defineModel<number | null>({ default: null })
const { t } = useT()
const inherits = computed(() => model.value === null && props.fallback !== null && props.fallback !== undefined)
</script>

<template>
  <div
    v-if="inherits"
    class="flex min-h-8 flex-wrap items-center gap-2"
  >
    <span class="text-sm text-highlighted">{{ minutesInWords(fallback!) }}</span>
    <UBadge
      :label="t('core.defaulted.badge')"
      color="neutral"
      variant="subtle"
      size="sm"
    />
    <UButton
      :label="t('core.defaulted.change')"
      color="neutral"
      variant="link"
      size="sm"
      :aria-label="t('core.defaulted.change-label', { label: label.toLowerCase() })"
      @click="model = fallback!"
    />
  </div>
  <div
    v-else
    class="space-y-1"
  >
    <MinutesInput
      v-model="model"
      :placeholder="fallback"
      :min="min"
      :max="max"
      :label="label"
    />
    <UButton
      v-if="fallback !== null && fallback !== undefined"
      :label="t('core.defaulted.use', { value: minutesInWords(fallback) })"
      color="neutral"
      variant="link"
      size="sm"
      class="px-0"
      @click="model = null"
    />
  </div>
</template>
