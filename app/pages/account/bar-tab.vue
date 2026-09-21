<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { saysClock, saysWhen } from '#shared/utils/when'
import type { ItemisedTab } from '#shared/utils/tab-settlement'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/members/tab' })

const request = useRequestFetch()

// A bare $fetch here carries no session cookie on a full page load, so the tab read back as the
// empty default and never refetched (issue 1005, same class as issue 899).
const { data, error, refresh } = await useAsyncData<{ ok: true, tab: ItemisedTab }>(
  'account-tab',
  () => request<{ ok: true, tab: ItemisedTab }>('/api/account/tab'),
)
const listFailure = useListFailure(error, 'Your tab could not be read.')

const tab = computed(() => data.value?.tab)

// The bar settles and voids from its own screen: re-reads on return to the tab, the same wake
// this app's SumUp watch uses, so a balance left open here does not silently drift.
const lastChecked = ref(new Date())

async function reread(): Promise<void> {
  await refresh()
  lastChecked.value = new Date()
}

function onReturnToTab(): void {
  if (document.visibilityState === 'visible') void reread()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onReturnToTab)
  window.addEventListener('focus', onReturnToTab)
  window.addEventListener('pageshow', onReturnToTab)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onReturnToTab)
  window.removeEventListener('focus', onReturnToTab)
  window.removeEventListener('pageshow', onReturnToTab)
})

// What a charge was for, read off its own lines rather than a total alone.
function describe(charge: ItemisedTab['charges'][number]): string {
  return charge.lines.map(line => `${line.qty}× ${line.variantLabel} ${line.productName}`).join(', ')
}
</script>

<template>
  <UContainer
    class="max-w-3xl py-10"
    data-test="account-tab-page"
  >
    <UPageHeader
      title="Your bar tab"
      description="A charge to a tab is credit extended, not money taken: settle it in person on the reader."
    />

    <UAlert
      v-if="listFailure"
      class="mt-6"
      data-test="load-failed"
      color="error"
      variant="subtle"
      icon="i-lucide-unplug"
      :title="listFailure.message"
      :actions="listFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listFailure.enrolPath, color: 'error' }] : []"
    />

    <div
      v-else-if="tab"
      class="mt-6 space-y-6"
    >
      <UCard data-test="account-tab-balance">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="nnt-headline text-lg">
              Outstanding
            </h2>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              data-test="account-tab-refresh"
              @click="reread"
            >
              Refresh
            </UButton>
          </div>
        </template>
        <p
          class="text-2xl font-semibold"
          data-test="account-tab-outstanding"
        >
          {{ saysMoney(tab.outstandingPence) }}
        </p>
        <p
          class="mt-1 text-xs text-muted"
          data-test="account-tab-checked"
        >
          Checked {{ saysClock(lastChecked) }}
        </p>
      </UCard>

      <UCard data-test="account-tab-charges">
        <template #header>
          <h2 class="nnt-headline text-lg">
            Charges
          </h2>
        </template>

        <ul
          v-if="tab.charges.length > 0"
          class="space-y-3 text-sm"
        >
          <li
            v-for="charge in tab.charges"
            :key="charge.entryId"
            class="flex items-start justify-between gap-3 border-b border-default pb-3 last:border-0"
            :data-test="`charge-${charge.entryId}`"
          >
            <div>
              <p>{{ describe(charge) }}</p>
              <p class="text-xs text-muted">
                {{ saysWhen(charge.happenedAt) }}
                · {{ saysMoney(charge.totalPence) }}
              </p>
            </div>
            <UBadge
              v-if="charge.voided"
              color="neutral"
              variant="subtle"
            >
              Voided
            </UBadge>
            <UBadge
              v-else-if="charge.settledAt"
              color="success"
              variant="subtle"
            >
              Settled
            </UBadge>
            <UBadge
              v-else
              color="warning"
              variant="subtle"
            >
              Outstanding
            </UBadge>
          </li>
        </ul>
        <p
          v-else
          class="py-4 text-center text-sm text-muted"
        >
          Nothing has ever been charged to your tab.
        </p>
      </UCard>
    </div>
  </UContainer>
</template>
