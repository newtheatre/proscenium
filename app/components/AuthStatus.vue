<script setup lang="ts">
const { account, refresh } = useAccount()

// The sidebar footer is 210px wide, so side by side there wraps the name and the button both.
defineProps<{ stacked?: boolean }>()

async function signOut(): Promise<void> {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await refresh()
  await navigateTo('/')
}
</script>

<template>
  <div
    class="flex gap-2"
    :class="stacked ? 'w-full flex-col items-stretch' : 'items-center'"
  >
    <template v-if="account.signedIn">
      <UButton
        size="sm"
        variant="ghost"
        to="/account/security"
        :block="stacked"
        :class="stacked ? 'justify-start truncate' : ''"
      >
        {{ account.user?.name }}
      </UButton>
      <UButton
        data-test="sign-out"
        size="sm"
        variant="ghost"
        :block="stacked"
        :class="stacked ? 'justify-start' : ''"
        icon="i-lucide-log-out"
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
