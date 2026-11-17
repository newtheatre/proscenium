<!-- The passkey offer after an email sign-in (ID-03). Skippable; staff are told the console needs one. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

useSeoMeta({ title: 'Add a passkey' })
const route = useRoute()
const next = nextPath(route.query.next) ?? '/'
const refusal = ref<Refusal | null>(null)
const codes = ref<string[] | null>(null)
// The account shell's guard has already sent a signed-out visitor to sign in (middleware/access.global.ts).
const { data: me } = await useAPI<{ signedIn: boolean, consoleNeedsPasskey?: boolean }>('/api/core/me', { key: 'core:me' })

async function add() {
  refusal.value = null
  // A stale sign-in is confirmed in place and the request sent again by `$api` (ID-28).
  const answer = await addMyPasskey()
  if (!answer.ok) {
    refusal.value = answer.refusal
    return
  }
  if (answer.data.recoveryCodes?.length) codes.value = answer.data.recoveryCodes
  else return navigateTo(next)
}
</script>

<template>
  <IdentityCard
    title="Add a passkey"
    :description="codes ? undefined : 'A passkey lets you sign in with your fingerprint, face or screen lock instead of waiting for an email.'"
  >
    <template v-if="!codes">
      <UAlert
        v-if="me?.consoleNeedsPasskey"
        color="info"
        icon="i-lucide-info"
        title="You will need a passkey to use the console."
      />
      <RefusalNotice :refusal="refusal" />
      <UButton
        block
        icon="i-lucide-key-round"
        loading-auto
        @click="add()"
      >
        Add a passkey
      </UButton>
      <UButton
        block
        color="neutral"
        variant="link"
        :to="next"
      >
        Not now
      </UButton>
    </template>
    <RecoveryCodes
      v-else
      :codes="codes"
      check-path="/api/core/me/recovery-codes/check"
      @kept="navigateTo(next)"
    />
  </IdentityCard>
</template>
