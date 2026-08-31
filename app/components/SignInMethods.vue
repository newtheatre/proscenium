<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import type { SignInMethod } from '#shared/utils/sign-in-methods'

// What this account can sign in with. A removal the server would refuse is never offered: the
// listing carries `removable`, so the screen and the endpoint agree (A-113).

const toast = useToast()
const { account, refresh: refreshAccount } = useAccount()
const methods = ref<SignInMethod[]>([])
const loading = ref(true)
const working = ref('')

const ICONS: Record<string, string> = {
  password: 'i-lucide-key-round',
  google: 'i-lucide-mail',
  passkey: 'i-lucide-fingerprint',
}

async function load(): Promise<void> {
  const { methods: found } = await $fetch<{ methods: SignInMethod[] }>('/api/account/methods')
  methods.value = found
  loading.value = false
}

function when(at: number | null): string {
  return at === null ? 'not recorded' : formatLondon(new Date(at * 1000), { dateStyle: 'medium' })
}

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
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    changing.value = false
  }
}

const { register, isSupported } = useWebAuthn({ registerEndpoint: '/api/auth/passkey/register' })
const enrolling = ref(false)

async function addPasskey(): Promise<void> {
  enrolling.value = true
  try {
    // The address is sent for the authenticator's own display only; the endpoint ignores it and
    // enrols for whoever holds the session (A-105 criterion 3).
    await register({ userName: account.value.user?.email ?? '', displayName: account.value.user?.name })
    toast.add({ title: 'Passkey added', icon: 'i-lucide-fingerprint', color: 'success' })
    await load()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    enrolling.value = false
  }
}

async function remove(method: SignInMethod): Promise<void> {
  working.value = method.id
  try {
    await $fetch(`/api/account/methods/${method.id}`, { method: 'DELETE' })
    toast.add({ title: `${method.label} removed`, icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = ''
  }
}

onMounted(load)
</script>

<template>
  <UPageCard
    title="How you sign in"
    description="The theatre never removes your last way in. Add another before taking one away."
  >
    <div
      v-if="loading"
      class="flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      <span>Reading your sign-in methods.</span>
    </div>

    <ul
      v-else
      class="divide-y divide-default"
      data-test="methods"
    >
      <li
        v-for="method in methods"
        :key="method.id"
        class="flex flex-wrap items-center gap-3 py-3"
      >
        <UIcon
          :name="ICONS[method.kind] ?? 'i-lucide-key-round'"
          class="size-5 text-muted"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">
            {{ method.label }}
          </p>
          <p class="text-sm text-muted">
            Added {{ when(method.addedAt) }}. Last used {{ when(method.lastUsedAt) }}.
          </p>
        </div>

        <UButton
          v-if="method.removable"
          size="sm"
          color="error"
          variant="subtle"
          :loading="working === method.id"
          :data-test="`remove-method-${method.id}`"
          @click="remove(method)"
        >
          Remove
        </UButton>
        <UBadge
          v-else
          color="neutral"
          variant="subtle"
          size="sm"
        >
          Your only way in
        </UBadge>
      </li>
    </ul>

    <template #footer>
      <div class="space-y-4">
        <UFormField
          label="Email address"
          name="email"
          description="Changing it signs out your other devices and asks the new address to confirm itself."
        >
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="wantedEmail"
              type="email"
              :placeholder="account.user?.email"
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
              Change it
            </UButton>
          </div>
        </UFormField>

        <UButton
          v-if="isSupported"
          icon="i-lucide-fingerprint"
          color="neutral"
          variant="subtle"
          :loading="enrolling"
          data-test="add-passkey"
          @click="addPasskey"
        >
          Add a passkey
        </UButton>
        <p
          v-else
          class="text-sm text-muted"
        >
          This browser cannot hold a passkey.
        </p>
      </div>
    </template>
  </UPageCard>
</template>
