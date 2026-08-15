<script lang="ts" setup>
/**
 * Passwords, Google sign-in and account closure live in the central account
 * service; this page links out.
 */
const config = useRuntimeConfig()

definePageMeta({
  middleware: 'auth',
  title: 'Security',
  description: 'Manage your password and account security',
})
</script>

<template>
  <UPageCard
    title="Account security"
    description="Passwords, Google sign-in, and logging out of every NNT site are managed centrally in your NNT account."
    variant="subtle"
  >
    <UButton
      :to="`${config.public.authBaseURL}/account`"
      external
      icon="i-lucide-external-link"
      class="self-start"
      label="Manage your NNT account"
    />
  </UPageCard>
</template>
