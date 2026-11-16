<!-- The one confirmation dialog, opened by useConfirm() through Nuxt UI's overlays. It closes with
     true only from the button that repeats the verb; Escape, the cross and "Keep" all answer false. -->
<script setup lang="ts">
import type { ConfirmRequest } from '../composables/useConfirm'

defineProps<ConfirmRequest>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()
const { t } = useT()
</script>

<template>
  <UModal
    :title="t('core.confirm.title', { verb, thing })"
    :description="consequence"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('core.confirm.keep')"
        @click="emit('close', false)"
      />
      <UButton
        color="error"
        :label="button ?? verb"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
