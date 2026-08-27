<script setup lang="ts">
const { account, refresh } = useAccount()

async function signOut(): Promise<void> {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await refresh()
  await navigateTo('/')
}
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="account.signedIn">
      <UButton
        size="sm"
        variant="ghost"
        to="/account/security"
      >
        {{ account.user?.name }}
      </UButton>
      <UButton
        data-test="sign-out"
        size="sm"
        variant="ghost"
        @click="signOut"
      >
        Sign out
      </UButton>
    </template>
    <UButton
      v-else
      size="sm"
      variant="ghost"
      to="/sign-in"
    >
      Sign in
    </UButton>
  </div>
</template>
