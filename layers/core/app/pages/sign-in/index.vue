<!-- Sign in (ID-01, ID-02, ID-04, ID-07): a passkey first, an emailed link and code, or an outside
     provider the theatre has switched on (Google so far), one button each (SignInForm). -->
<script setup lang="ts">
// Someone already signed in is sent on before the page is made. The page reads the same answer.
definePageMeta({
  middleware: async (to) => {
    const { data } = await useAPI<{ signedIn: boolean }>('/api/core/me', { key: 'core:me' })
    if (data.value?.signedIn) return navigateTo(nextPath(to.query.next) ?? '/')
  },
})
useSeoMeta({ title: 'Sign in' })
const route = useRoute()
const next = nextPath(route.query.next)
const sent = ref(false)
const { data: me } = useNuxtData<{ signedIn: boolean, signIn?: { email: boolean, openSignUp?: boolean } }>('core:me')
</script>

<template>
  <IdentityCard
    :title="sent ? 'Check your email' : 'Sign in'"
    :description="!sent && me?.signIn?.email && me?.signIn?.openSignUp ? 'New here? Signing in with your email creates your account.' : undefined"
  >
    <SignInForm
      v-model:sent="sent"
      :next="next"
    />
  </IdentityCard>
</template>
