<!-- The passkey offer after an email sign-in (ID-03), made only to staff whose roles reach the
     console: they are told it needs one, and are asked every time until they have one. Everyone
     else meets the offer as a notice on My account, which "Not now" here also puts away. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

const { t } = useT()
useSeoMeta({ title: () => t('core.passkey-offer.title') })
const route = useRoute()
const next = nextPath(route.query.next) ?? '/'
const refusal = ref<Refusal | null>(null)
const codes = ref<string[] | null>(null)
// The account shell's guard has already sent a signed-out visitor to sign in (middleware/access.global.ts).
const { data: me } = await useAPI<{ signedIn: boolean, consoleNeedsPasskey?: boolean }>('/api/core/me', { key: 'core:me' })

const LATER_DAYS = 90 // not-policy: how long "Not now" lasts in this browser
const later = useCookie(PASSKEY_LATER_COOKIE, { maxAge: LATER_DAYS * 24 * 60 * 60, sameSite: 'lax', path: '/' })

function notNow() {
  later.value = '1'
  return navigateTo(next)
}

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
    :title="t('core.passkey-offer.title')"
    :description="codes ? undefined : t('core.passkey-offer.description')"
  >
    <template v-if="!codes">
      <UAlert
        v-if="me?.consoleNeedsPasskey"
        color="info"
        icon="i-lucide-info"
        :title="t('core.passkey-offer.console-needs')"
      />
      <RefusalNotice :refusal="refusal" />
      <UButton
        block
        icon="i-lucide-key-round"
        loading-auto
        :label="t('core.passkey-offer.add')"
        @click="add()"
      />
      <UButton
        block
        color="neutral"
        variant="link"
        :label="t('core.passkey-offer.not-now')"
        @click="notNow()"
      />
    </template>
    <RecoveryCodes
      v-else
      :codes="codes"
      @kept="navigateTo(next)"
    />
  </IdentityCard>
</template>
