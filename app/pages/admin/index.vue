<script setup lang="ts">
import { can, viewAuditTrail, viewBackups, viewCommsOperations } from '#shared/utils/abilities'
import { queuesFor, saysSetUp, setUpHref } from '#shared/utils/console-overview'
import { saysNotificationStatus } from '#shared/utils/notifications'
import { currentShowNight } from '#shared/utils/show-night'
import { NAV_COUNTS, NAV_QUEUES } from '#shared/utils/site-nav'
import { saysClock, saysDay, saysWhen } from '#shared/utils/when'
import type { ConsoleOverview } from '#shared/utils/console-overview'
import type { Ref } from 'vue'
import type { ListFailure } from '~/composables/useListFailure'

definePageMeta({ layout: 'console', title: 'Overview', middleware: 'console', docs: '/docs/system' })

// Route middleware is rendering convenience only; the server guard is what actually refuses
// (docs/architecture.md). A 403 here means the guard did its job.
const { account } = useAccount()
const request = useRequestFetch()
const viewer = useViewer()

// The sidebar's own counts, which the console layout reads on every screen: one answer, so the
// badges and this list agree, and a queue the viewer cannot decide is never in it (issue 1358).
const { counts, failure: waitingFailure, refresh: refreshWaiting } = useNavCounts()
const waiting = computed(() => NAV_COUNTS.flatMap(count => (counts.value[count] === undefined
  ? []
  : [{ count, ...NAV_QUEUES[count], total: counts.value[count] }])))
// A failed read is news only to somebody who decides a queue; anybody else has no card to fail.
const decidesAny = computed(() => viewer.value !== null && queuesFor(new Set(viewer.value.permissions), viewer.value.leadsDepartment).length > 0)

const { data: overview, error: overviewError } = await useAsyncData(
  'console-overview',
  () => request<ConsoleOverview>('/api/admin/overview'),
  { default: (): ConsoleOverview => ({ setUp: [], tonight: null }), immediate: false },
)
const overviewFailure = useListFailure(overviewError, 'Tonight and the set-up still to do could not be read.')

// A missed or failed drill stays in front of the committee until one passes (K-108 criterion 3).
interface DrillStatus { lastDrillAt: string | null, lastDrillOutcome: 'PASS' | 'FAIL' | null, overdue: boolean }
const seesDrill = computed(() => can(viewer.value, viewBackups))
const { data: drill, error: drillError } = await useAsyncData(
  'drill-status',
  () => request<DrillStatus>('/api/admin/backups'),
  { default: (): DrillStatus | null => null, immediate: false },
)
const drillFailure = useListFailure(drillError, 'Whether a restore drill is due could not be read.')
const drillTitle = computed(() => {
  if (drill.value?.lastDrillOutcome === 'FAIL') return 'The last restore drill failed'
  return drill.value?.lastDrillAt ? 'A restore drill is overdue' : 'No restore drill has ever passed'
})

interface Trouble { id: string, type: string, status: string, error: string | null, userId: string | null, who: string | null, at: number }

// A message that never arrived is invisible by nature, so it is put where somebody looks rather
// than left in a table nobody opens (C-113 criterion 5).
const { data: trouble, error: troubleError } = await useAsyncData(
  'delivery-trouble',
  () => request<{ items: Trouble[], total: number }>('/api/admin/notifications/trouble'),
  { default: (): { items: Trouble[], total: number } => ({ items: [], total: 0 }), immediate: false },
)
const troubleFailure = useListFailure(troubleError, 'The messages that did not arrive could not be read.')

// Every card refused for want of an authenticator is one fact, said once at the top with the way
// through; a card keeps a failure of its own only when it is something else (A-112 criterion 1).
const wall = computed(() => [waitingFailure, overviewFailure, drillFailure, troubleFailure]
  .map(failure => failure.value).find(failure => failure?.enrolPath) ?? null)
const ownFailure = (failure: Ref<ListFailure | null>) => computed(() => (failure.value?.enrolPath ? null : failure.value))
const waitingOwn = ownFailure(waitingFailure)
const overviewOwn = ownFailure(overviewFailure)
const drillOwn = ownFailure(drillFailure)
const troubleOwn = ownFailure(troubleFailure)

// A published show nobody has assessed is a surprise waiting to be sprung on somebody, so it is
// put where the committee looks rather than left for a visitor to find (D-102 criterion 2).
const { data: unassessed } = await useAsyncData(
  'unassessed-shows',
  () => request<{ items: { id: string, title: string }[], total: number }>('/api/admin/shows', {
    query: { unassessed: true, pageSize: 5 },
  }),
  { default: (): { items: { id: string, title: string }[], total: number } => ({ items: [], total: 0 }), immediate: false },
)

// Keyed on the error where there is one and on the status otherwise, because a suppression is
// the status itself rather than a failure with a reason (H-102 criterion 3).
const WHY: Record<string, string> = {
  'SUPPRESSED_PREFERENCE': 'muted this topic',
  'preference': 'muted this topic',
  'unverified-address': 'has not proved their address',
  'no-account': 'the account is gone',
  'anonymised': 'the account was erased',
}

function saysWhy(entry: Trouble): string {
  return WHY[entry.error ?? ''] ?? WHY[entry.status] ?? entry.error ?? 'no reason recorded'
}

// Only somebody who may read the trail is shown it: a trainer or a lead reaches this screen too
// now, and an empty card would tell them nothing had failed (issue 1336).
const seesTrouble = computed(() => can(viewer.value, viewAuditTrail))
// A person's send history is the send log's, and opening one is audited there (H-106 criterion 5).
const seesSendLog = computed(() => can(viewer.value, viewCommsOperations))

onMounted(() => {
  if (!account.value.signedIn) return
  void refreshNuxtData('console-overview')
  if (seesDrill.value) void refreshNuxtData('drill-status')
  if (seesTrouble.value) void refreshNuxtData('delivery-trouble')
  // Silently empty when the reader holds no ticketing permission, which is the same answer the
  // route gives: the card renders nothing rather than a refusal they cannot act on.
  void refreshNuxtData('unassessed-shows')
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

    <ReadFailure
      v-if="wall"
      :failure="wall"
      data-test="authenticator-wall"
    />

    <UAlert
      v-if="seesDrill && drill?.overdue"
      data-test="drill-overdue"
      color="warning"
      variant="subtle"
      icon="i-lucide-database-backup"
      :title="drillTitle"
      description="Restore a backup into a scratch copy and record the drill. This stays here until one passes."
      :actions="[{ label: 'Open backups', color: 'warning', variant: 'outline', to: '/admin/backups' }]"
    />
    <UAlert
      v-else-if="seesDrill && drillOwn"
      data-test="drill-failed"
      color="error"
      variant="subtle"
      :description="drillOwn.message"
    />

    <UPageCard
      v-if="waiting.length > 0 || (waitingOwn && decidesAny)"
      title="Waiting for you"
      description="Every queue you decide, with how many are in it now."
      data-test="waiting-for-you"
    >
      <ReadFailure
        v-if="waitingOwn"
        :failure="waitingOwn"
        data-test="waiting-failed"
        @retry="refreshWaiting"
      />
      <ul
        v-else
        class="divide-y divide-default text-sm"
      >
        <li
          v-for="queue in waiting"
          :key="queue.count"
          class="flex items-baseline justify-between gap-3 py-2"
        >
          <ULink
            :to="queue.to"
            class="underline underline-offset-4"
          >
            {{ queue.says }}
          </ULink>
          <UBadge
            :color="queue.total > 0 ? 'primary' : 'neutral'"
            variant="subtle"
            :data-test="`waiting-${queue.count}`"
          >
            {{ queue.total }}
          </UBadge>
        </li>
      </ul>
    </UPageCard>

    <MoneyNightsNeedingYou />

    <ReadFailure
      v-if="overviewOwn"
      :failure="overviewOwn"
      data-test="overview-failed"
      @retry="refreshNuxtData('console-overview')"
    />

    <UPageCard
      v-if="overview.tonight !== null"
      title="Tonight"
      :description="`The show night of ${saysDay(currentShowNight())}, 04:00 to 04:00.`"
      data-test="tonight-card"
    >
      <p
        v-if="overview.tonight.length === 0"
        class="text-sm text-muted"
      >
        Nothing is on tonight.
      </p>
      <ul
        v-else
        class="divide-y divide-default text-sm"
      >
        <li
          v-for="performance in overview.tonight"
          :key="performance.performanceId"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
        >
          <span class="font-medium">{{ performance.showTitle }}</span>
          <span class="text-muted">{{ performance.venueName }}</span>
          <span class="ms-auto font-mono text-xs text-muted">{{ saysClock(performance.startsAt) }}</span>
        </li>
      </ul>
      <div class="mt-3">
        <UButton
          to="/tonight"
          variant="subtle"
          icon="i-lucide-moon-star"
        >
          Open tonight's screens
        </UButton>
      </div>
    </UPageCard>

    <UPageCard
      v-if="overview.setUp.length > 0"
      title="Set-up still to do"
      description="What the theatre has not yet been given, each opening the screen that finishes it."
      data-test="set-up-to-do"
    >
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="line in overview.setUp"
          :key="saysSetUp(line)"
          class="py-2"
        >
          <ULink
            :to="setUpHref(line)"
            class="underline underline-offset-4"
            :data-test="`set-up-${line.kind}`"
          >
            {{ saysSetUp(line) }}
          </ULink>
        </li>
      </ul>
    </UPageCard>

    <UPageCard
      v-if="seesTrouble"
      title="Messages that did not arrive"
      description="Every send is logged, including the ones that never reached a provider. A failure here is a person who was not told something."
      data-test="delivery-trouble"
    >
      <ReadFailure
        v-if="troubleOwn"
        :failure="troubleOwn"
        data-test="trouble-failed"
        @retry="refreshNuxtData('delivery-trouble')"
      />

      <p
        v-else-if="trouble.items.length === 0"
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
            :color="entry.status === 'FAILED' || entry.status === 'FAILED_FINAL' ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ saysNotificationStatus(entry.status) }}
          </UBadge>
          <ULink
            v-if="seesSendLog && entry.userId"
            :to="`/comms/operations/accounts/${entry.userId}`"
            class="font-medium underline underline-offset-4"
          >
            {{ entry.who ?? 'Nobody' }}
          </ULink>
          <span
            v-else
            class="font-medium"
          >{{ entry.who ?? 'Nobody' }}</span>
          <span class="font-mono text-xs text-muted">{{ entry.type }}</span>
          <span class="text-muted">{{ saysWhy(entry) }}</span>
          <span class="ms-auto text-xs text-muted">
            {{ saysWhen(entry.at) }}
          </span>
        </li>
      </ul>

      <div
        v-if="seesSendLog"
        class="mt-3"
      >
        <UButton
          to="/comms/operations"
          variant="subtle"
          icon="i-lucide-list"
        >
          Open the send log
        </UButton>
      </div>
    </UPageCard>

    <UPageCard
      v-if="unassessed.total > 0"
      title="Published shows nobody has assessed for content warnings"
      description="No warnings and no confirmation that there are none. The show page says as much, which is honest and is not the answer anybody wants on a published show."
      data-test="unassessed-shows"
    >
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="show in unassessed.items"
          :key="show.id"
          class="flex flex-wrap items-baseline gap-x-3 py-2"
        >
          <ULink :to="`/box-office/shows/${show.id}`">
            {{ show.title }}
          </ULink>
        </li>
      </ul>
      <p
        v-if="unassessed.total > unassessed.items.length"
        class="mt-2 text-xs text-muted"
      >
        {{ plural(unassessed.total, 'show') }} in all.
      </p>
    </UPageCard>
  </div>
  <UAlert
    v-else
    color="warning"
    variant="subtle"
    title="Not signed in"
    description="Sign in to reach the admin screens."
  />
</template>
