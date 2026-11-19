<!-- Where an emailed link lands. The token is in the fragment, so it never reaches a server log.
     It is used only on a press: mail scanners open links in a real browser (04-states-and-rules). -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

interface Arrived { next: string, offerPasskey: boolean, welcome: boolean, invitation?: { by: string | null, roles: string[] } }

const { t } = useT()
const { language } = useDates()
useSeoMeta({ title: 'Sign in' })
const refusal = ref<Refusal | null>(null)
const arrived = ref<Arrived | null>(null)
const token = ref('')

const invitedLine = computed(() => {
  const invitation = arrived.value?.invitation
  if (!invitation) return ''
  const roles = new Intl.ListFormat(language.value, { type: 'conjunction' }).format(invitation.roles)
  if (invitation.by && roles) return t('core.invitation.landing.by-to', { name: invitation.by, roles })
  if (roles) return t('core.invitation.landing.to', { roles })
  if (invitation.by) return t('core.invitation.landing.by', { name: invitation.by })
  return t('core.invitation.landing.plain')
})

onMounted(() => {
  token.value = window.location.hash.slice(1)
  // Vue Router keeps its own data in the history state, so it is passed back rather than cleared.
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
})

async function signIn() {
  refusal.value = null
  const answer = await callIdentity<Arrived>('/api/core/sign-in/link', { token: token.value })
  if (!answer.ok) {
    refusal.value = answer.refusal
    return
  }
  if (answer.data.invitation) {
    arrived.value = answer.data
    return
  }
  return arriveSignedIn(answer.data)
}
</script>

<template>
  <IdentityCard :title="arrived?.invitation ? t('core.invitation.landing.title') : 'Sign in'">
    <RefusalNotice :refusal="refusal" />
    <UButton
      v-if="refusal"
      to="/sign-in"
      color="neutral"
      variant="outline"
    >
      Back to sign in
    </UButton>
    <template v-else-if="arrived?.invitation">
      <p class="text-sm">
        {{ invitedLine }}
      </p>
      <UButton
        block
        :label="t('core.invitation.landing.continue')"
        @click="arriveSignedIn(arrived)"
      />
    </template>
    <template v-else>
      <p class="text-sm text-muted">
        Press Sign in to finish signing in from your email.
      </p>
      <UButton
        block
        label="Sign in"
        loading-auto
        @click="signIn()"
      />
    </template>
  </IdentityCard>
</template>
