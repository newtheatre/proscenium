<!-- Confirm it is you before a sensitive change (ID-28): a passkey, or a fresh emailed link. -->
<script setup lang="ts">
import type { Refusal } from '../../composables/useIdentity'

useSeoMeta({ title: 'Confirm it is you' })
const route = useRoute()
const next = nextPath(route.query.next) ?? '/'
const refusal = ref<Refusal | null>(null)
const busy = ref(false)

async function confirm() {
  busy.value = true
  refusal.value = null
  const answer = await provePasskey('/api/core/me/reassert/options', '/api/core/me/reassert')
  busy.value = false
  if (answer.ok) return navigateTo(next)
  refusal.value = answer.refusal
}
</script>

<template>
  <IdentityCard
    title="Confirm it is you"
    description="For your safety, confirm your sign-in before making this change."
  >
    <RefusalNotice :refusal="refusal" />
    <UButton
      block
      icon="i-lucide-key-round"
      :loading="busy"
      @click="confirm"
    >
      Use my passkey
    </UButton>
    <UButton
      block
      color="neutral"
      variant="link"
      :to="{ path: '/sign-in', query: { next } }"
    >
      No passkey on this device? Sign in again by email
    </UButton>
  </IdentityCard>
</template>
