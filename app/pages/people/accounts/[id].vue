<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'

definePageMeta({ layout: 'console', title: 'Account', middleware: 'console' })

interface Grant { role: string, expiresAt: number | null, grantedAt: number, live: boolean }

interface View {
  account: { id: string, name: string, email: string, verified: boolean, disabled: boolean, anonymisedAt: number | null }
  methods: { password: boolean, google: boolean, passkeys: number, factor: boolean, recoveryCodesRemaining: number }
  grants: Grant[]
  memberships: { id: string, startsOn: string, expiresOn: string, source: string, confirmedAt: number | null }[]
  fellowship: { id: string, awardedOn: string, awardedBy: string, citation: string, revokedAt: number | null } | null
  history: { action: string, target: string | null, createdAt: number, byThem: boolean }[]
}

interface MergeCounts { bookings: number, records: number, shifts: number, memberships: number, grants: number }
interface MergePreview { winner: { id: string, name: string, email: string }, loser: { id: string, name: string, email: string }, counts: MergeCounts }
interface DirectoryItem { id: string, name: string, email: string }

const route = useRoute()
const view = ref<View | null>(null)
const failure = ref<string | null>(null)
const working = ref('')

// The account this page shows is always the losing side: merging it away is one of its own
// security-adjacent actions, the same way disabling or erasing it is (A-123).
const mergeSearch = ref('')
const mergeFailure = ref<string | null>(null)
const mergePreview = ref<MergePreview | null>(null)
const mergeConfirmEmail = ref('')
const mergeWorking = ref(false)

async function previewMerge(): Promise<void> {
  mergeFailure.value = null
  mergePreview.value = null
  mergeWorking.value = true
  try {
    const found = await $fetch<{ items: DirectoryItem[] }>('/api/admin/accounts', { query: { search: mergeSearch.value, pageSize: 5 } })
    const winner = found.items.find(item => item.email.toLowerCase() === mergeSearch.value.trim().toLowerCase())
    if (!winner) {
      mergeFailure.value = 'No account matches that email exactly.'
      return
    }
    mergePreview.value = await $fetch<MergePreview>(`/api/admin/accounts/${route.params.id}/merge-preview`, {
      method: 'POST',
      body: { winnerId: winner.id },
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
    mergeSearch.value = ''
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

async function operate(operation: string): Promise<void> {
  working.value = operation
  failure.value = null
  try {
    await $fetch(`/api/admin/accounts/${route.params.id}/security`, { method: 'POST', body: { operation } })
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = ''
  }
}

const when = (at: number): string => formatLondon(new Date(at * 1000), { dateStyle: 'medium', timeStyle: 'short' })

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
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

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
            v-if="!view.account.verified"
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
          >
            <span class="font-mono">{{ grant.role }}</span>
            <span class="text-muted">
              {{ grant.live ? 'until' : 'lapsed' }}
              {{ grant.expiresAt ? when(grant.expiresAt) : 'further notice' }}
            </span>
          </li>
        </ul>
      </UPageCard>

      <UPageCard
        title="Membership"
        description="A term bought at the SU, not a committee year (0031)."
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
            {{ membership.startsOn }} to {{ membership.expiresOn }}
            ({{ membership.source.toLowerCase() }}{{ membership.confirmedAt ? ', checked' : ', not yet checked' }})
          </li>
        </ul>
      </UPageCard>

      <UPageCard
        v-if="view.fellowship"
        data-test="fellowship"
        title="Fellowship"
        description="A permanent honour, and the theatre's own record (0023)."
      >
        <p class="text-sm">
          Awarded {{ view.fellowship.awardedOn }} by {{ view.fellowship.awardedBy }}.
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
            @click="operate('disable')"
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
            @click="operate('reset-mfa')"
          >
            Reset the authenticator
          </UButton>
        </div>
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
          <UFormField label="Winning account's email">
            <UInput
              v-model="mergeSearch"
              data-test="merge-search"
              type="email"
              placeholder="winner@example.com"
            />
          </UFormField>
          <UButton
            data-test="merge-preview"
            variant="subtle"
            :loading="mergeWorking"
            :disabled="!mergeSearch.trim()"
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
            <span class="font-medium">{{ mergePreview.winner.email }}</span> and becomes a tombstone.
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
        description="The last 25 entries naming this account. Searching the whole trail is J-103."
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
          class="space-y-1 font-mono text-sm"
        >
          <li
            v-for="entry in view.history"
            :key="`${entry.action}-${entry.createdAt}`"
          >
            <span class="text-muted">{{ when(entry.createdAt) }}</span>
            {{ entry.action }}
            <span
              v-if="!entry.byThem"
              class="text-muted"
            >(done to them)</span>
          </li>
        </ul>
      </UPageCard>
    </div>
  </div>
</template>
