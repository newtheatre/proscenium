<script setup lang="ts">
import type { ListFailure } from '~/composables/useListFailure'

// A read that did not finish, shown in place of the list (K-127 criterion 7). Never beside an
// empty state: the empty state's words promise there is nothing, which this cannot know.
const props = defineProps<{ failure: ListFailure }>()
const emit = defineEmits<{ retry: [] }>()

const actions = computed(() => [
  { label: 'Try again', color: 'error' as const, variant: 'subtle' as const, onClick: () => emit('retry') },
  ...(props.failure.enrolPath
    ? [{ label: 'Set up an authenticator app', to: props.failure.enrolPath, color: 'error' as const, variant: 'subtle' as const }]
    : []),
])
</script>

<template>
  <UAlert
    data-test="read-failure"
    color="error"
    variant="subtle"
    :description="failure.message"
    :actions="actions"
  />
</template>
