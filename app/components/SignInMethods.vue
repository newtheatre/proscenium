<script setup lang="ts">
import { saysDay } from '#shared/utils/when'
import { refusalToAddPassword, securityNextStep } from '#shared/utils/sign-in-methods'
import type { SignInMethod } from '#shared/utils/sign-in-methods'

// What this account can sign in with. A removal the server would refuse is never offered: the
// listing carries `removable`, so the screen and the endpoint agree (A-113).

// Whether an authenticator a role needs comes first, so a passkey waits its turn; null until the
// page knows, so a passkey is never offered first and then taken away (issue 1344).
const props = defineProps<{ authenticatorFirst: boolean | null }>()

const toast = useToast()
const { account } = useAccount()
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

// A method nobody has signed in with yet says when it was added and stops there, rather than
// telling the reader what the account holds about them.
function saysUse(method: SignInMethod): string {
  const added = method.addedAt === null ? [] : [`Added ${saysDay(method.addedAt)}.`]
  const used = method.lastUsedAt === null ? [] : [`Last used ${saysDay(method.lastUsedAt)}.`]
  return [...added, ...used].join(' ')
}

// A stale session on any of these three opens the modal instead of a toast; the retry is the
// same call again, in full, so its loading state and toast still apply (A-128 criterion 3).
const reauthenticating = ref(false)
const pending = ref<(() => Promise<void>) | null>(null)

function retryAfterReauthentication(): void {
  const action = pending.value
  pending.value = null
  if (action) void action()
}

// 0008: a Workspace address holds no password by any path, so the field is not offered on one.
const passwordRefusal = computed(() => refusalToAddPassword({ email: account.value.user?.email ?? '' }))
const wantedPassword = ref('')
const settingPassword = ref(false)

async function setPassword(): Promise<void> {
  settingPassword.value = true
  try {
    const answer = await $fetch<{ added: boolean }>('/api/account/password', {
      method: 'PUT',
      body: { password: wantedPassword.value },
    })
    wantedPassword.value = ''
    toast.add({ title: answer.added ? 'Password added' : 'Password changed', icon: 'i-lucide-key-round', color: 'success' })
    await load()
  }
  catch (error) {
    if (needsReauthentication(error)) {
      pending.value = setPassword
      reauthenticating.value = true
    }
    else {
      toast.add({ title: refusalText(error), color: 'error' })
    }
  }
  finally {
    settingPassword.value = false
  }
}

const { register, isSupported } = useWebAuthn({ registerEndpoint: '/api/auth/passkey/register' })
const enrolling = ref(false)

// The passkey is this viewer's next step unless a role's authenticator comes first (issue 1344).
const passkeyNext = computed(() => !loading.value && props.authenticatorFirst !== null && securityNextStep({
  authenticatorRequired: props.authenticatorFirst,
  authenticatorConfirmed: false,
  passkeySupported: isSupported.value,
  holdsPasskey: methods.value.some(method => method.kind === 'passkey'),
}) === 'passkey')

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
    if (needsReauthentication(error)) {
      pending.value = addPasskey
      reauthenticating.value = true
    }
    else {
      toast.add({ title: refusalText(error), color: 'error' })
    }
  }
  finally {
    enrolling.value = false
  }
}

// Asked first (A-113 criterion 6); a stale session then swaps the confirmation for the modal,
// and the retry is remove itself, so nothing is asked twice or skipped (A-128 criterion 9).
const removing = ref<SignInMethod | null>(null)
const removeFailure = ref<string | null>(null)
const removeOpen = computed({
  get: () => removing.value !== null,
  // Held open while the call runs: backing out then could not stop it, only orphan its outcome.
  set: (value) => { if (!value && working.value === '') removing.value = null },
})

function askToRemove(method: SignInMethod): void {
  removeFailure.value = null
  removing.value = method
}

async function remove(method: SignInMethod): Promise<void> {
  working.value = method.id
  removeFailure.value = null
  try {
    await $fetch(`/api/account/methods/${method.id}`, { method: 'DELETE' })
    removing.value = null
    toast.add({ title: `${method.label} removed`, icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    if (needsReauthentication(error)) {
      removing.value = null
      pending.value = () => remove(method)
      reauthenticating.value = true
    }
    else if (removing.value) {
      removeFailure.value = refusalText(error)
    }
    else {
      toast.add({ title: refusalText(error), color: 'error' })
    }
  }
  finally {
    working.value = ''
  }
}

onMounted(load)
</script>

<template>
  <UPageCard
    title="Ways in"
    description="We never remove your last way in. Add another before taking one away."
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
            {{ saysUse(method) }}
          </p>
        </div>

        <UButton
          v-if="method.removable"
          size="sm"
          color="error"
          variant="subtle"
          :loading="working === method.id"
          :data-test="`remove-method-${method.id}`"
          @click="askToRemove(method)"
        >
          Remove this way in
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
          v-if="passwordRefusal === null"
          label="Password"
          name="password"
          description="Add one, or replace the one you have."
        >
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="wantedPassword"
              type="password"
              placeholder="New password"
              class="w-full sm:w-80"
              data-test="new-password"
            />
            <UButton
              color="neutral"
              variant="subtle"
              :disabled="!wantedPassword"
              :loading="settingPassword"
              data-test="set-password"
              @click="setPassword"
            >
              Save the password
            </UButton>
          </div>
        </UFormField>
        <p
          v-else
          class="text-sm text-muted"
        >
          Theatre addresses sign in with Google and cannot hold a password.
        </p>

        <UButton
          v-if="isSupported && authenticatorFirst !== null && !passkeyNext && !loading"
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
          v-else-if="!isSupported"
          class="text-sm text-muted"
        >
          This browser cannot hold a passkey.
        </p>
      </div>
    </template>
  </UPageCard>

  <UPageCard
    v-if="passkeyNext"
    class="mt-6"
    title="Add a passkey"
    description="Sign in with your fingerprint, your face or your screen lock: nothing to type, and nothing anybody can steal from you or from us."
    highlight
    data-test="next-step"
  >
    <div>
      <UButton
        icon="i-lucide-fingerprint"
        :loading="enrolling"
        data-test="add-passkey"
        @click="addPasskey"
      >
        Add a passkey
      </UButton>
    </div>
  </UPageCard>

  <ConfirmModal
    v-model:open="removeOpen"
    name="remove-method"
    title="Remove this way in"
    verb="Remove this way in"
    :consequence="removing ? `${removing.label} stops working as a way in to this account, and we email you to say so.` : undefined"
    :loading="working !== ''"
    :failure="removeFailure"
    @confirm="removing && remove(removing)"
  />

  <ReauthenticateModal
    v-model:open="reauthenticating"
    @reauthenticated="retryAfterReauthentication"
  />
</template>
