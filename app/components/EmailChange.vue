<script setup lang="ts">
// The address an account is known and reached by, changed where the rest of how somebody is known
// is kept (issue 1344). A stale session asks to re-authenticate, then retries in full (A-128).
defineProps<{ audience: string }>()

const toast = useToast()
const { account, refresh: refreshAccount } = useAccount()

const reauthenticating = ref(false)
const changing = ref(false)
const wantedEmail = ref('')

async function changeEmail(): Promise<void> {
  changing.value = true
  try {
    const answer = await $fetch<{ message: string }>('/api/account/email', {
      method: 'PUT',
      body: { email: wantedEmail.value },
    })
    wantedEmail.value = ''
    toast.add({ title: answer.message, icon: 'i-lucide-mail', color: 'success' })
    await refreshAccount()
  }
  catch (error) {
    if (needsReauthentication(error)) reauthenticating.value = true
    else toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    changing.value = false
  }
}
</script>

<template>
  <UPageCard
    title="Email address"
    :description="audience"
  >
    <div class="space-y-4">
      <!-- The address is said above the field, never as its placeholder: a placeholder made an
           empty field look filled, so nobody could tell what had been typed (issue 1152 item 1). -->
      <p class="text-sm text-muted">
        You sign in as <span data-test="current-email">{{ account.user?.email }}</span>.
      </p>
      <UFormField
        label="New email address"
        name="email"
        description="Changing it signs out your other devices and asks the new address to confirm itself."
      >
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="wantedEmail"
            type="email"
            class="w-full sm:w-80"
            data-test="new-email"
          />
          <UButton
            color="neutral"
            variant="subtle"
            :disabled="!wantedEmail"
            :loading="changing"
            data-test="change-email"
            @click="changeEmail"
          >
            Change the address
          </UButton>
        </div>
      </UFormField>
    </div>

    <ReauthenticateModal
      v-model:open="reauthenticating"
      @reauthenticated="changeEmail"
    />
  </UPageCard>
</template>
