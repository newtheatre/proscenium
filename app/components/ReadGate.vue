<script setup lang="ts">
import type { ListFailure } from '~/composables/useListFailure'

// A console screen's work, or the reason its read did not finish in its place: never an empty
// list beneath a refusal with its create button still live (0119).
const props = defineProps<{ failure: ListFailure | null }>()
const emit = defineEmits<{ retry: [] }>()

// A question the route could not answer (a bad filter or period) keeps the controls that change it.
const asked = computed(() => props.failure?.status === 400 || props.failure?.status === 422)
</script>

<template>
  <div>
    <ReadFailure
      v-if="failure"
      :failure="failure"
      @retry="emit('retry')"
    />
    <slot v-if="!failure || asked" />
  </div>
</template>
