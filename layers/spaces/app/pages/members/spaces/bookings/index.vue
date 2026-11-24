<!-- My room bookings (spec part 5, "My bookings"; SP-18): what is coming up, requests waiting for a
     decision, and the past, newest first. -->
<script setup lang="ts">
import type { BookingState } from '../../../../../shared/states'

interface Summary { id: string, bookableName: string, startsAt: number, endsAt: number, state: BookingState, title: string, purpose: string }

const { t } = useT()
const dates = useDates()
const route = useRoute()
const router = useRouter()

const { data, status, error, refresh } = await useAPI<{ upcoming: Summary[], requests: Summary[], past: Summary[] }>('/api/spaces/bookings', { key: 'spaces:mine' })

const TABS = ['upcoming', 'requests', 'past'] as const
type Tab = typeof TABS[number]
const tab = computed<Tab>(() => (TABS as readonly string[]).includes(String(route.query.tab)) ? route.query.tab as Tab : 'upcoming')
const tabs = computed(() => TABS.map(value => ({ value, label: t(`spaces.mine.tabs.${value}`), badge: value === 'requests' && data.value?.requests.length ? data.value.requests.length : undefined })))
const rows = computed(() => data.value?.[tab.value] ?? [])
const describe = (b: Summary) => [dates.range(b.startsAt, b.endsAt, 'dateTime'), b.bookableName].join(' · ')
const STATE_COLOUR: Partial<Record<BookingState, 'success' | 'warning' | 'neutral' | 'error'>> = { confirmed: 'success', requested: 'warning', declined: 'error', bumped: 'error', cancelled: 'neutral' }
</script>

<template>
  <PageFrame
    :title="t('spaces.mine.title')"
    :trail="[{ label: t('spaces.calendar.title'), to: '/members/spaces' }]"
  >
    <template #primary>
      <UButton
        to="/members/spaces/book"
        icon="i-lucide-plus"
        :label="t('spaces.calendar.book')"
      />
    </template>
    <UTabs
      :model-value="tab"
      :items="tabs"
      :content="false"
      class="mb-4"
      @update:model-value="router.replace({ query: { ...route.query, tab: String($event) } })"
    />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!rows.length"
        icon="i-lucide-calendar-clock"
        :title="t(`spaces.mine.empty.${tab}`)"
      />
      <RecordList
        v-else
        :label="t(`spaces.mine.tabs.${tab}`)"
      >
        <RecordListItem
          v-for="b in rows"
          :key="b.id"
          :to="`/members/spaces/bookings/${b.id}`"
          :name="b.title"
          :description="describe(b)"
        >
          <UBadge
            :color="STATE_COLOUR[b.state] ?? 'neutral'"
            variant="subtle"
            :label="t(`spaces.states.${b.state}`)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
