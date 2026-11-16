<!-- A refusal says why, and what would let the person through. -->
<script setup lang="ts">
import type { RefusalView } from '../composables/useRefusal'

const props = defineProps<{
  refusal: Pick<RefusalView, 'reason' | 'remedy'> & Partial<RefusalView>
  /** Where to send a signed-out visitor, if the remedy is to sign in. */
  signInTo?: string
}>()
const { t } = useT()
const signedOut = computed(() => props.refusal.code === 'core.access.signed-out' || props.refusal.status === 401)
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-lock"
    :title="refusal.reason"
    :description="refusal.remedy"
    role="alert"
  >
    <template
      v-if="signedOut && signInTo"
      #actions
    >
      <UButton
        :to="signInTo"
        :label="t('core.refused.sign-in')"
        color="neutral"
        variant="outline"
      />
    </template>
  </UAlert>
</template>
