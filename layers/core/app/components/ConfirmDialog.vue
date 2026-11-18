<!-- The one confirmation dialog, opened by useConfirm() through Nuxt UI's overlays. It closes with
     true only from the button that repeats the verb; Escape, the cross and "Keep" all answer false. -->
<script setup lang="ts">
import type { ConfirmRequest } from '../composables/useConfirm'

const props = defineProps<ConfirmRequest>()
// With a tick box, confirming answers whether it was left ticked.
const emit = defineEmits<{ close: [answer: boolean | { ticked: boolean }] }>()
const { t } = useT()
const ticked = ref(props.tick?.ticked ?? false)
const confirmed = () => emit('close', props.tick ? { ticked: ticked.value } : true)
</script>

<template>
  <UModal
    :title="t('core.confirm.title', { verb, thing })"
    :description="consequence"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template
      v-if="tick"
      #body
    >
      <UCheckbox
        v-model="ticked"
        :label="tick.label"
      />
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('core.confirm.keep')"
        @click="emit('close', false)"
      />
      <UButton
        :color="tone === 'primary' ? 'primary' : 'error'"
        :label="button ?? verb"
        @click="confirmed"
      />
    </template>
  </UModal>
</template>
