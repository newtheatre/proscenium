<script setup lang="ts">
import { saysDay, saysWhen } from '#shared/utils/when'
import { can, createAccounts, disableAccounts, grantRoles, revokeRoles } from '#shared/utils/abilities'
import { saysRole } from '#shared/utils/roles'
import { describeAction } from '#shared/utils/audit-actions'

definePageMeta({ layout: 'console', title: 'Account', middleware: 'console', docs: '/docs/people/accounts' })

interface Grant { role: string, expiresAt: number | null, grantedAt: number, note: string | null, live: boolean }

interface View {
  account: { id: string, name: string, email: string, verified: boolean, disabled: boolean, anonymisedAt: number | null, shadow: boolean, pendingGoogleEmail: string | null }
  methods: { password: boolean, google: boolean, passkeys: number, factor: boolean, recoveryCodesRemaining: number }
  grants: Grant[]
  memberships: { id: string, startsOn: string, expiresOn: string, source: string, confirmedAt: number | null }[]
  fellowship: { id: string, awardedOn: string, awardedBy: string, citation: string, revokedAt: number | null } | null
  history: { action: string, target: string | null, createdAt: number, byThem: boolean }[]
}

interface MergeCounts { bookings: number, records: number, shifts: number, memberships: number, grants: number }
interface MergePreview { winner: { id: string, name: string, email: string }, loser: { id: string, name: string, email: string }, counts: MergeCounts }

const route = useRoute()
const toast = useToast()
const view = ref<View | null>(null)
const failure = ref<string | null>(null)
const working = ref('')

// The account this page shows is always the losing side: merging it away is one of its own
// security-adjacent actions, the same way disabling or erasing it is (A-123).
const mergeWinnerId = ref<string | undefined>(undefined)
const mergeFailure = ref<string | null>(null)
const mergePreview = ref<MergePreview | null>(null)
const mergeConfirmEmail = ref('')
const mergeWorking = ref(false)

const sees = computed(() => ({
  grants: can(useViewer().value, grantRoles),
  revokes: can(useViewer().value, revokeRoles),
  disables: can(useViewer().value, disableAccounts),
  prelinks: can(useViewer().value, createAccounts),
}))

// The Workspace address their first Google sign-in claims; clearing it confirms, because the
// next Google sign-in would then make them a second, empty account (A-121 criterion 7).
const linkAddress = ref('')
const linkFailure = ref<string | null>(null)
const clearingLink = ref(false)

async function saveGoogleLink(googleEmail: string | null): Promise<void> {
  working.value = 'google-link'
  linkFailure.value = null
  try {
    await $fetch(`/api/admin/accounts/${route.params.id}/google-link`, { method: 'PATCH', body: { googleEmail } })
    clearingLink.value = false
    linkAddress.value = ''
    toast.add({ title: googleEmail === null ? 'Workspace address cleared' : 'Workspace address set', icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    linkFailure.value = refusalText(error)
  }
  finally {
    working.value = ''
  }
}

// A role already held live is not offered again: re-granting it would renew the grant rather
// than add one, which is a different act from the one this form offers (A-131 criterion 5).
const heldRoles = computed(() =>
  (view.value?.grants ?? []).filter(grant => grant.live).map(grant => grant.role))

const revoking = ref<string | null>(null)
const revokeFailure = ref<string | null>(null)

async function revokeRole(): Promise<void> {
  const role = revoking.value
  if (!role) return
  working.value = `revoke-${role}`
  revokeFailure.value = null
  try {
    // Query, not body: a DELETE carrying a body hangs the Workers runtime when read (0068).
    await $fetch('/api/admin/roles', { method: 'DELETE', query: { userId: route.params.id, role } })
    revoking.value = null
    const name = view.value?.account.name
    toast.add({ title: 'Role revoked', description: name ? `${name} no longer holds ${saysRole(role)}.` : undefined, icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    revokeFailure.value = refusalText(error)
  }
  finally {
    working.value = ''
  }
}

// Disabling and resetting an authenticator both lock somebody out, so both confirm; signing out
// everywhere and enabling do not (K-123 criterion 7).
const securing = ref<'disable' | 'reset-mfa' | null>(null)

const SECURED = {
  'sign-out': 'Signed out everywhere',
  'disable': 'Account disabled',
  'enable': 'Account enabled',
  'reset-mfa': 'Authenticator reset',
} as const
const secureFailure = ref<string | null>(null)

async function secure(): Promise<void> {
  const operation = securing.value
  if (!operation) return
  working.value = operation
  secureFailure.value = null
  try {
    await $fetch(`/api/admin/accounts/${route.params.id}/security`, { method: 'POST', body: { operation } })
    securing.value = null
    toast.add({ title: SECURED[operation], icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    secureFailure.value = refusalText(error)
  }
  finally {
    working.value = ''
  }
}

// Erasure gets the same typed confirmation as the merge card, because both are one-way (0011).
const eraseReveal = ref(false)
const eraseConfirmEmail = ref('')

async function eraseAccount(): Promise<void> {
  working.value = 'erase'
  failure.value = null
  try {
    await $fetch(`/api/admin/accounts/${route.params.id}/security`, { method: 'POST', body: { operation: 'erase' } })
    eraseReveal.value = false
    eraseConfirmEmail.value = ''
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = ''
  }
}

async function previewMerge(): Promise<void> {
  const winnerId = mergeWinnerId.value
  if (!winnerId) return
  mergeFailure.value = null
  mergePreview.value = null
  mergeWorking.value = true
  try {
    mergePreview.value = await $fetch<MergePreview>(`/api/admin/accounts/${route.params.id}/merge-preview`, {
      method: 'POST',
      body: { winnerId },
    })
  }
  catch (error) {
    mergeFailure.value = refusalText(error)
  }
  finally {
    mergeWorking.value = false
  }
}

async function confirmMerge(): Promise<void> {
  if (!mergePreview.value) return
  mergeFailure.value = null
  mergeWorking.value = true
  try {
    await $fetch(`/api/admin/accounts/${route.params.id}/merge`, {
      method: 'POST',
      body: { winnerId: mergePreview.value.winner.id, confirmEmail: mergeConfirmEmail.value },
    })
    mergePreview.value = null
    mergeWinnerId.value = undefined
    mergeConfirmEmail.value = ''
    await load()
  }
  catch (error) {
    mergeFailure.value = refusalText(error)
  }
  finally {
    mergeWorking.value = false
  }
}

async function load(): Promise<void> {
  failure.value = null
  try {
    view.value = await $fetch<View>(`/api/admin/accounts/${route.params.id}`)
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

async function operate(operation: 'sign-out' | 'enable'): Promise<void> {
  working.value = operation
  failure.value = null
  try {
    await $fetch(`/api/admin/accounts/${route.params.id}/security`, { method: 'POST', body: { operation } })
    toast.add({ title: SECURED[operation], icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = ''
  }
}

const signsInWith = computed(() => {
  const methods = view.value?.methods
  if (!methods) return []
  return [
    methods.password ? 'A password' : null,
    methods.google ? 'Google' : null,
    methods.passkeys ? plural(methods.passkeys, 'passkey') : null,
    methods.factor ? `An authenticator, with ${plural(methods.recoveryCodesRemaining, 'recovery code')} left` : null,
  ].filter(Boolean) as string[]
})

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UButton
      to="/people/accounts"
      data-test="back-to-accounts"
      variant="link"
      color="neutral"
      size="sm"
      icon="i-lucide-arrow-left"
      class="px-0"
    >
      Accounts
    </UButton>

    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-else-if="!view"
      data-test="account-skeleton"
      class="space-y-6"
    >
      <div class="space-y-2">
        <USkeleton class="h-7 w-56" />
        <USkeleton class="h-4 w-72" />
      </div>
      <USkeleton
        v-for="card in 3"
        :key="card"
        class="h-32 w-full"
      />
    </div>

    <div
      v-if="view"
      class="space-y-6"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            data-test="account-name"
            class="nnt-headline text-xl"
          >
            {{ view.account.name }}
          </h2>
          <p class="font-mono text-sm text-muted">
            {{ view.account.email }}
          </p>
        </div>
        <div class="flex gap-1">
          <UBadge
            v-if="view.account.disabled"
            data-test="state-disabled"
            color="error"
            variant="subtle"
          >
            Disabled
          </UBadge>
          <UBadge
            v-if="view.account.shadow"
            data-test="state-shadow"
            color="neutral"
            variant="subtle"
          >
            Shadow
          </UBadge>
          <UBadge
            v-else-if="!view.account.verified"
            color="warning"
            variant="subtle"
          >
            Unverified
          </UBadge>
        </div>
      </div>

      <UPageCard title="Signs in with">
        <ul
          v-if="signsInWith.length"
          data-test="methods"
          class="list-inside list-disc text-sm"
        >
          <li
            v-for="method in signsInWith"
            :key="method"
          >
            {{ method }}
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-muted"
        >
          Nothing yet. This account cannot sign in.
        </p>

        <div
          v-if="sees.prelinks && !view.methods.google && !view.account.anonymisedAt"
          data-test="google-link"
          class="mt-3 space-y-3 border-t border-default pt-3"
        >
          <p
            v-if="view.account.pendingGoogleEmail"
            data-test="google-link-pending"
            class="text-sm"
          >
            Their first Google sign-in with
            <span class="font-mono">{{ view.account.pendingGoogleEmail }}</span>
            joins this account.
          </p>
          <UAlert
            v-if="linkFailure && !clearingLink"
            data-test="google-link-failure"
            color="error"
            variant="subtle"
            :description="linkFailure"
          />
          <form
            class="flex flex-wrap items-end gap-2"
            @submit.prevent="saveGoogleLink(linkAddress)"
          >
            <UFormField
              label="Workspace address"
              description="A @newtheatre.org.uk address. Their own address stays as it is."
              class="w-full sm:w-96"
            >
              <UInput
                v-model="linkAddress"
                data-test="google-link-address"
                type="email"
                required
                :placeholder="view.account.pendingGoogleEmail ?? 'name@newtheatre.org.uk'"
              />
            </UFormField>
            <UButton
              type="submit"
              data-test="google-link-save"
              variant="subtle"
              :loading="working === 'google-link' && !clearingLink"
            >
              {{ view.account.pendingGoogleEmail ? 'Change the address' : 'Set the address' }}
            </UButton>
            <UButton
              v-if="view.account.pendingGoogleEmail"
              data-test="google-link-clear"
              color="error"
              variant="ghost"
              @click="linkFailure = null; clearingLink = true"
            >
              Clear the address
            </UButton>
          </form>
        </div>
      </UPageCard>

      <UPageCard title="Roles">
        <p
          v-if="!view.grants.length"
          class="text-sm text-muted"
        >
          None.
        </p>
        <ul
          v-else
          data-test="grants"
          class="space-y-1 text-sm"
        >
          <li
            v-for="grant in view.grants"
            :key="grant.role"
            class="flex items-center justify-between gap-2"
          >
            <span>
              <span>{{ saysRole(grant.role) }}</span>
              <span class="text-muted">
                {{ grant.live ? 'until' : 'lapsed' }}
                {{ grant.expiresAt ? saysWhen(grant.expiresAt) : 'further notice' }}
              </span>
              <span
                v-if="grant.note"
                class="block text-xs text-muted"
                :data-test="`grant-note-${grant.role}`"
              >
                {{ grant.note }}
              </span>
            </span>
            <UButton
              v-if="grant.live && sees.revokes"
              size="xs"
              color="error"
              variant="ghost"
              :loading="working === `revoke-${grant.role}`"
              :data-test="`revoke-${grant.role}`"
              @click="revokeFailure = null; revoking = grant.role"
            >
              Revoke
            </UButton>
          </li>
        </ul>

        <div
          v-if="sees.grants"
          class="mt-3 border-t border-default pt-3"
        >
          <RoleGrantForm
            :user-id="String(route.params.id)"
            :held="heldRoles"
            @granted="load"
          />
        </div>

        <UButton
          class="mt-3"
          to="/people/roles"
          variant="link"
          size="sm"
          icon="i-lucide-shield"
          label="Open the register"
          data-test="open-register"
        />
      </UPageCard>

      <UPageCard
        title="Membership"
        description="A term bought at the SU, not a committee year."
      >
        <p
          v-if="!view.memberships.length"
          class="text-sm text-muted"
        >
          No membership recorded.
        </p>
        <ul
          v-else
          class="text-sm"
        >
          <li
            v-for="membership in view.memberships"
            :key="membership.id"
          >
            {{ saysDay(membership.startsOn) }} to {{ saysDay(membership.expiresOn) }}
            ({{ membership.source.toLowerCase() }}{{ membership.confirmedAt ? ', checked' : ', not yet checked' }})
          </li>
        </ul>
      </UPageCard>

      <UPageCard
        v-if="view.fellowship"
        data-test="fellowship"
        title="Fellowship"
        description="A permanent honour, and the theatre's own record."
      >
        <p class="text-sm">
          Awarded {{ saysDay(view.fellowship.awardedOn) }} by {{ view.fellowship.awardedBy }}.
          <UBadge
            v-if="view.fellowship.revokedAt"
            class="ml-1"
            color="error"
            variant="subtle"
            size="sm"
          >
            Revoked
          </UBadge>
        </p>
        <p class="mt-2 text-sm text-muted">
          {{ view.fellowship.citation }}
        </p>
      </UPageCard>

      <UPageCard
        v-if="sees.disables"
        title="Security"
        description="These take effect on the next request, everywhere."
      >
        <div class="flex flex-wrap gap-2">
          <UButton
            data-test="sign-out-everywhere"
            variant="subtle"
            :loading="working === 'sign-out'"
            @click="operate('sign-out')"
          >
            Sign out everywhere
          </UButton>
          <UButton
            v-if="!view.account.disabled"
            data-test="disable"
            color="error"
            variant="subtle"
            :loading="working === 'disable'"
            @click="secureFailure = null; securing = 'disable'"
          >
            Disable the account
          </UButton>
          <UButton
            v-else
            data-test="enable"
            variant="subtle"
            :loading="working === 'enable'"
            @click="operate('enable')"
          >
            Enable the account
          </UButton>
          <UButton
            data-test="reset-mfa"
            color="error"
            variant="subtle"
            :loading="working === 'reset-mfa'"
            @click="secureFailure = null; securing = 'reset-mfa'"
          >
            Reset the authenticator
          </UButton>
        </div>

        <template v-if="!view.account.anonymisedAt">
          <UButton
            v-if="!eraseReveal"
            class="mt-4"
            color="error"
            variant="soft"
            data-test="erase-reveal"
            @click="eraseReveal = true"
          >
            Erase this account
          </UButton>

          <div
            v-else
            class="mt-4 space-y-3 border-t border-default pt-3"
            data-test="erase-confirm"
          >
            <p class="text-sm">
              Anonymises the account in one transaction. Bookings, records and shifts stay; nothing
              personal about {{ view.account.email }} survives it. This cannot be undone.
            </p>
            <UFormField :label="`Type ${view.account.email} to confirm`">
              <UInput
                v-model="eraseConfirmEmail"
                data-test="erase-confirm-email"
              />
            </UFormField>
            <div class="flex gap-2">
              <UButton
                color="error"
                variant="subtle"
                :loading="working === 'erase'"
                :disabled="eraseConfirmEmail.trim().toLowerCase() !== view.account.email.toLowerCase()"
                data-test="erase-submit"
                @click="eraseAccount"
              >
                Erase the account
              </UButton>
              <UButton
                variant="ghost"
                @click="eraseReveal = false; eraseConfirmEmail = ''"
              >
                Cancel
              </UButton>
            </div>
          </div>
        </template>
      </UPageCard>

      <UPageCard
        v-if="!view.account.anonymisedAt"
        data-test="merge"
        title="Merge into another account"
        description="A dry run first: nothing changes until the losing account's email is typed back as confirmation."
      >
        <UAlert
          v-if="mergeFailure"
          data-test="merge-failure"
          color="error"
          variant="subtle"
          :description="mergeFailure"
          class="mb-3"
        />

        <div
          v-if="!mergePreview"
          class="flex flex-wrap items-end gap-2"
        >
          <UFormField
            label="Winning account"
            class="w-full sm:w-96"
          >
            <PersonPicker
              v-model="mergeWinnerId"
              data-test="merge-winner"
              placeholder="Search by name, address or student number"
            />
          </UFormField>
          <UButton
            data-test="merge-preview"
            variant="subtle"
            :loading="mergeWorking"
            :disabled="!mergeWinnerId"
            @click="previewMerge"
          >
            Preview the merge
          </UButton>
        </div>

        <div
          v-else
          data-test="merge-preview-result"
          class="space-y-3"
        >
          <p class="text-sm">
            <span class="font-medium">{{ view.account.email }}</span> moves into
            <span class="font-medium">{{ mergePreview.winner.email }}</span> and is emptied.
            Nothing here is undone once confirmed.
          </p>
          <ul class="list-inside list-disc text-sm">
            <li>{{ plural(mergePreview.counts.bookings, 'booking') }}</li>
            <li>{{ plural(mergePreview.counts.records, 'training record') }}</li>
            <li>{{ plural(mergePreview.counts.shifts, 'shift') }}</li>
            <li>{{ plural(mergePreview.counts.memberships, 'membership') }}</li>
            <li>{{ plural(mergePreview.counts.grants, 'role grant') }}</li>
          </ul>
          <UFormField :label="`Type ${view.account.email} to confirm`">
            <UInput
              v-model="mergeConfirmEmail"
              data-test="merge-confirm-email"
            />
          </UFormField>
          <div class="flex gap-2">
            <UButton
              data-test="merge-confirm"
              color="error"
              variant="subtle"
              :loading="mergeWorking"
              :disabled="mergeConfirmEmail.trim().toLowerCase() !== view.account.email.toLowerCase()"
              @click="confirmMerge"
            >
              Merge the accounts
            </UButton>
            <UButton
              variant="ghost"
              @click="mergePreview = null; mergeConfirmEmail = ''"
            >
              Cancel
            </UButton>
          </div>
        </div>
      </UPageCard>

      <UPageCard
        title="Recent activity"
        description="The last 25 entries naming this account."
      >
        <p
          v-if="!view.history.length"
          class="text-sm text-muted"
        >
          Nothing recorded, or you do not have permission to read the trail.
        </p>
        <ul
          v-else
          data-test="history"
          class="space-y-1 text-sm"
        >
          <li
            v-for="entry in view.history"
            :key="`${entry.action}-${entry.createdAt}`"
          >
            <span class="text-muted">{{ saysWhen(entry.createdAt) }}</span>
            {{ describeAction(entry.action).label }}
            <span
              v-if="!entry.byThem"
              class="text-muted"
            >(done to them)</span>
          </li>
        </ul>
      </UPageCard>
    </div>

    <ConfirmModal
      :open="revoking !== null"
      name="revoke-role"
      :title="revoking ? `Revoke ${saysRole(revoking)}` : ''"
      :verb="revoking ? `Revoke ${saysRole(revoking)}` : ''"
      consequence="Their permission stops now. Nothing they did under it is touched."
      :loading="working.startsWith('revoke-')"
      :failure="revokeFailure"
      @update:open="value => { if (!value) revoking = null }"
      @confirm="revokeRole"
    />

    <ConfirmModal
      :open="clearingLink"
      name="clear-google-link"
      title="Clear the Workspace address"
      verb="Clear the address"
      :consequence="`Their next Google sign-in with ${view?.account.pendingGoogleEmail ?? 'it'} makes a second, empty account instead of joining this one.`"
      :loading="working === 'google-link'"
      :failure="linkFailure"
      @update:open="value => { if (!value) clearingLink = false }"
      @confirm="saveGoogleLink(null)"
    />

    <ConfirmModal
      :open="securing !== null"
      name="secure-account"
      :title="securing === 'disable' ? `Disable ${view?.account.name}'s account` : `Reset ${view?.account.name}'s authenticator`"
      :verb="securing === 'disable' ? 'Disable the account' : 'Reset the authenticator'"
      :consequence="securing === 'disable'
        ? 'They are signed out everywhere and cannot sign in again until somebody enables the account.'
        : 'Their authenticator and recovery codes go, and they are signed out everywhere. An officer holding a privileged role cannot sign in again until they enrol a new one.'"
      :loading="working === securing"
      :failure="secureFailure"
      @update:open="value => { if (!value) securing = null }"
      @confirm="secure"
    />
  </div>
</template>
