<!-- Sign in (ID-01, ID-02, ID-04, ID-07): an emailed link and code first, as most people use it,
     then a passkey, or an outside provider the theatre has switched on (Google so far), one button
     each (SignInForm). -->
<script setup lang="ts">
// Someone already signed in is sent on before the page is made. The page reads the same answer.
definePageMeta({
  middleware: async (to) => {
    const { data } = await useAPI<{ signedIn: boolean }>('/api/core/me', { key: 'core:me' })
    if (data.value?.signedIn) return navigateTo(nextPath(to.query.next) ?? '/')
  },
})
const { t } = useT()
useSeoMeta({ title: () => t('core.sign-in.page.title') })
const route = useRoute()
const next = nextPath(route.query.next)
const sent = ref(false)
const { data: me } = useNuxtData<{ signedIn: boolean, signIn?: { email: boolean, openSignUp?: boolean } }>('core:me')
</script>

<template>
  <IdentityCard
    :title="sent ? t('core.sign-in.page.sent-title') : t('core.sign-in.page.title')"
    :description="!sent && me?.signIn?.email && me?.signIn?.openSignUp ? t('core.sign-in.page.open-sign-up') : undefined"
  >
    <SignInForm
      v-model:sent="sent"
      :next="next"
    />
  </IdentityCard>
</template>
