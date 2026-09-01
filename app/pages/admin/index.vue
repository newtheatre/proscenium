<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'

definePageMeta({ layout: 'admin', title: 'Overview' })

// Route middleware is rendering convenience only; the server guard is what actually refuses
// (docs/architecture.md). A 403 here means the guard did its job.
const { account } = useAccount()
const request = useRequestFetch()

interface Trouble { id: string, type: string, status: string, error: string | null, who: string | null, at: number }

// A message that never arrived is invisible by nature, so it is put where somebody looks rather
// than left in a table nobody opens (C-113 criterion 5).
const { data: trouble } = await useAsyncData(
  'delivery-trouble',
  () => request<{ items: Trouble[], total: number }>('/api/admin/notifications/trouble'),
  { default: (): { items: Trouble[], total: number } => ({ items: [], total: 0 }), immediate: false },
)

const SAYS: Record<string, string> = {
  FAILED: 'The provider refused it',
  SKIPPED_UNDELIVERABLE: 'Not sent',
}

const WHY: Record<string, string> = {
  'preference': 'muted this topic',
  'unverified-address': 'has not proved their address',
  'no-account': 'the account is gone',
  'anonymised': 'the account was erased',
}

function saysWhy(entry: Trouble): string {
  return WHY[entry.error ?? ''] ?? entry.error ?? 'no reason recorded'
}

onMounted(() => {
  if (account.value.signedIn) void refreshNuxtData('delivery-trouble')
})
</script>

<template>
  <div
    v-if="account.signedIn"
    class="space-y-8"
  >
    <p class="text-muted">
      Signed in as {{ account.user?.name }}.
    </p>

    <UPageCard
      title="Messages that did not arrive"
      description="Every send is logged, including the ones that never reached a provider. A failure here is a person who was not told something."
      data-test="delivery-trouble"
    >
      <p
        v-if="trouble.items.length === 0"
        class="text-sm text-muted"
        data-test="trouble-none"
      >
        Nothing has failed or been suppressed.
      </p>

      <ul
        v-else
        class="divide-y divide-default text-sm"
      >
        <li
          v-for="entry in trouble.items"
          :key="entry.id"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
        >
          <UBadge
            :color="entry.status === 'FAILED' ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ SAYS[entry.status] ?? entry.status }}
          </UBadge>
          <span class="font-medium">{{ entry.who ?? 'Nobody' }}</span>
          <span class="font-mono text-xs text-muted">{{ entry.type }}</span>
          <span class="text-muted">{{ saysWhy(entry) }}</span>
          <span class="ms-auto text-xs text-muted">
            {{ formatLondon(new Date(entry.at * 1000), { dateStyle: 'medium', timeStyle: 'short' }) }}
          </span>
        </li>
      </ul>
    </UPageCard>

    <p class="text-sm text-muted">
      The rest of this screen arrives with the stories that need it.
    </p>
  </div>
  <UAlert
    v-else
    color="warning"
    variant="subtle"
    title="Not signed in"
    description="Sign in to reach the admin screens."
  />
</template>
