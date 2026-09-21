<script setup lang="ts">
import { CONFIRM_BACK_LABEL } from '#shared/utils/admin-conventions'

// The one confirmation on the console (K-123 criterion 7, 0032). A refusal renders in here,
// above the footer: a page alert would sit behind the overlay where nobody reads it.

defineProps<{
  // Names the data-test hooks, so a flow can be driven without guessing at button text.
  name: string
  title: string
  verb: string
  consequence?: string
  color?: 'error' | 'primary'
  loading?: boolean
  failure?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const slots = useSlots()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="consequence"
  >
    <template
      v-if="slots.body || failure"
      #body
    >
      <div
        class="space-y-4"
        :data-test="`confirm-${name}-body`"
      >
        <slot name="body" />
        <UAlert
          v-if="failure"
          :data-test="`confirm-${name}-failure`"
          color="error"
          variant="subtle"
          :description="failure"
        />
      </div>
    </template>

    <template #footer>
      <UButton
        :color="color ?? 'error'"
        :loading="loading"
        :data-test="`confirm-${name}-verb`"
        @click="emit('confirm')"
      >
        {{ verb }}
      </UButton>
      <UButton
        color="neutral"
        variant="ghost"
        :data-test="`confirm-${name}-back`"
        @click="open = false"
      >
        {{ CONFIRM_BACK_LABEL }}
      </UButton>
    </template>
  </UModal>
</template>
