<script setup lang="ts">
const { data, refresh } = await useFetch('/api/auth/session')

async function signOut(): Promise<void> {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await refresh()
  await navigateTo('/')
}
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="data?.signedIn">
      <span class="hidden text-sm text-muted sm:inline">{{ data.user.name }}</span>
      <UButton
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
