<script setup lang="ts">
// The address an account is known and reached by, changed where the rest of how somebody is known
// is kept (issue 1344). A stale session asks to re-authenticate, then retries in full (A-128).
defineProps<{ audience: string }>()

const toast = useToast()
const { account, refresh: refreshAccount } = useAccount()

const request = useRequestFetch()
const { data: address, refresh: refreshAddress } = await useAsyncData('account-email', () =>
  request<{ email: string, pending: string | null }>('/api/account/email'))

const reauthenticating = ref(false)
const changing = ref(false)
const cancelling = ref(false)
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
    await Promise.all([refreshAccount(), refreshAddress()])
  }
  catch (error) {
    if (needsReauthentication(error)) reauthenticating.value = true
    else toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    changing.value = false
  }
}

async function cancelChange(): Promise<void> {
  cancelling.value = true
  try {
    await $fetch('/api/account/email', { method: 'DELETE' })
    toast.add({ title: 'Address change cancelled', icon: 'i-lucide-mail-x', color: 'success' })
    await refreshAddress()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    cancelling.value = false
  }
}
</script>

<template>
  <UPageCard
    id="email"
    title="Email address"
    :description="audience"
  >
    <div class="space-y-4">
      <!-- The address is said above the field, never as its placeholder: a placeholder made an
           empty field look filled, so nobody could tell what had been typed (issue 1152 item 1). -->
      <p class="text-sm text-muted">
        You sign in as <span data-test="current-email">{{ account.user?.email }}</span>.
      </p>
      <UAlert
        v-if="address?.pending"
        data-test="pending-email"
        color="info"
        variant="subtle"
        icon="i-lucide-mail"
        :description="`Waiting for ${address.pending} to be confirmed. Until the link in that inbox is opened, you still sign in as ${account.user?.email}.`"
      >
        <template #actions>
          <UButton
            label="Cancel this change"
            color="neutral"
            variant="outline"
            :loading="cancelling"
            data-test="cancel-email-change"
            @click="cancelChange"
          />
        </template>
      </UAlert>
      <UFormField
        label="New email address"
        name="email"
        description="We email a link to the new address. Nothing changes until it is opened; then every device signs out and you sign in with the new address."
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
