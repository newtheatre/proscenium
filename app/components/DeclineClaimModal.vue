<script setup lang="ts">
import { shiftDeclineForm } from '#shared/utils/rota'
import type { FormSubmitEvent } from '@nuxt/ui'

// The reason a declined claim carries, which the claimant reads word for word (E-105 criterion
// 3); a lapsed claimant's arrives already written (issue 1302).
const props = defineProps<{
  open: boolean
  title: string
  consequence: string
  offered?: string
  loading: boolean
  failure: string | null
}>()

const emit = defineEmits<{ close: [], decline: [reason: string] }>()

const state = reactive<{ reason?: string }>({})

watch(() => props.open, (isOpen) => {
  if (isOpen) state.reason = props.offered
}, { immediate: true })

function submit(event: FormSubmitEvent<{ reason: string }>): void {
  emit('decline', event.data.reason)
}
</script>

<template>
  <ConfirmModal
    :open="open"
    name="decline-claim"
    :title="title"
    verb="Decline the claim"
    :consequence="consequence"
    form="decline-form"
    :loading="loading"
    :failure="failure"
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <UForm
        id="decline-form"
        :schema="shiftDeclineForm"
        :state="state"
        class="space-y-4"
        @submit="submit"
      >
        <UFormField
          name="reason"
          label="Reason"
          required
        >
          <UTextarea
            v-model="state.reason"
            data-test="decline-reason"
            :rows="3"
            autoresize
            :maxrows="6"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>
  </ConfirmModal>
</template>
