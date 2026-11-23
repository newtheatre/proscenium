<!-- A count that takes the theatre's value until it is given its own, the sibling of the kit's
     DefaultedMinutes: left to the theatre it shows that value with a "Theatre default" badge and
     Change; once changed it is an ordinary number box, with a way back to the theatre's. -->
<script setup lang="ts">
const props = defineProps<{ fallback?: number | null, min?: number, max?: number, label: string }>()
const model = defineModel<number | null>({ default: null })
const { t } = useT()
const inherits = computed(() => model.value === null && props.fallback !== null && props.fallback !== undefined)
</script>

<template>
  <div
    v-if="inherits"
    class="flex min-h-8 flex-wrap items-center gap-2"
  >
    <span class="text-sm text-highlighted">{{ fallback }}</span>
    <UBadge
      :label="t('box-office.setup.default.badge')"
      color="neutral"
      variant="subtle"
      size="sm"
    />
    <UButton
      :label="t('box-office.setup.default.change')"
      color="neutral"
      variant="link"
      size="sm"
      :aria-label="t('box-office.setup.default.change-label', { label: label.toLowerCase() })"
      @click="model = fallback!"
    />
  </div>
  <div
    v-else
    class="space-y-1"
  >
    <UInputNumber
      v-model="model"
      class="w-40"
      :min="min"
      :max="max"
      :aria-label="label"
    />
    <UButton
      v-if="fallback !== null && fallback !== undefined"
      :label="t('box-office.setup.default.use', { value: fallback })"
      color="neutral"
      variant="link"
      size="sm"
      class="block px-0"
      @click="model = null"
    />
  </div>
</template>
