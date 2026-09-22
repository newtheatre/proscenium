<script setup lang="ts">
import { rotaStepAfter } from '#shared/utils/rota-flow'

// The way on to the next rota screen (K-123 criterion 12). The last step in the flow renders
// nothing rather than looping back to the first.

const props = defineProps<{ step: string }>()

const next = computed(() => rotaStepAfter(props.step))
</script>

<template>
  <UButton
    v-if="next"
    :to="next.to"
    color="neutral"
    variant="link"
    trailing-icon="i-lucide-arrow-right"
    class="p-0"
    data-test="rota-next-step"
  >
    {{ next.onward }}
  </UButton>
</template>
