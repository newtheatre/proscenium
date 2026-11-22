<!-- A refusal says why, and what would let the person through. -->
<script setup lang="ts">
import type { RefusalView } from '../utils/refusal'

const props = defineProps<{
  refusal: Pick<RefusalView, 'reason' | 'remedy'> & Partial<RefusalView>
  /** Where to send a signed-out visitor, if the remedy is to sign in. */
  signInTo?: string
}>()
const { t } = useT()
const signedOut = computed(() => props.refusal.code === 'core.access.signed-out' || props.refusal.status === 401)
const go = computed(() => refusalAction(props.refusal))
</script>

<template>
  <UAlert
    color="warning"
    icon="i-lucide-lock"
    :title="refusal.reason"
    :description="refusal.remedy"
    role="alert"
  >
    <template
      v-if="(signedOut && signInTo) || go"
      #actions
    >
      <UButton
        v-if="signedOut && signInTo"
        :to="signInTo"
        :label="t('core.refused.sign-in')"
        color="neutral"
        variant="outline"
      />
      <UButton
        v-else-if="go"
        :to="go.to"
        :label="go.label"
        color="neutral"
        variant="outline"
        trailing-icon="i-lucide-arrow-right"
      />
    </template>
  </UAlert>
</template>
