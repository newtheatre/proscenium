<!-- Requests I have sent (S11): each request with how many have answered, open ones first, and a new
     request for groups the organiser plans for. -->
<script setup lang="ts">
import type { Sent, SentRow } from '../../../../composables/useRequests'

const { t } = useT()
const dates = useDates()
const { data, status, error, refresh } = await useAPI<Sent>('/api/availability/requests/sent', { key: 'availability:sent' })
const adding = ref(false)

function line(r: SentRow): string {
  const asked = r.counts.asked + r.counts.answered + r.counts.lapsed
  return `${dates.range(r.from, r.to)} · ${t('availability.sent.answered-of', { answered: r.counts.answered, asked })} · ${t('availability.sent.due-on', { due: dates.day(r.dueOn) })}`
}

async function sent(id: string) {
  adding.value = false
  await refresh()
  await navigateTo(`/members/find-a-time/requests/${id}`)
}
</script>

<template>
  <PageFrame
    :title="t('availability.sent.title')"
    :description="t('availability.sent.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        icon="i-lucide-send"
        :label="t('availability.sent.new')"
        @click="adding = true"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.requests.length"
          icon="i-lucide-send"
          :title="t('availability.sent.none')"
          :description="t('availability.sent.none-help')"
          :action="d.groups.length ? { label: t('availability.sent.new'), icon: 'i-lucide-send', onClick: () => { adding = true } } : undefined"
        />
        <RecordList
          v-else
          :label="t('availability.sent.title')"
        >
          <RecordListItem
            v-for="r in d.requests"
            :key="r.id"
            :to="`/members/find-a-time/requests/${r.id}`"
            icon="i-lucide-calendar-check"
            :name="r.title"
            :description="line(r)"
            :muted="!r.open"
          >
            <StatusBadge
              :tone="r.open ? 'info' : 'neutral'"
              :label="r.open ? t('availability.sent.open') : t('availability.sent.closed')"
            />
          </RecordListItem>
        </RecordList>
        <USlideover
          v-model:open="adding"
          :title="t('availability.sent.new')"
          :description="t('availability.sent.new-help')"
        >
          <template #body>
            <EmptyState
              v-if="!d.groups.length"
              icon="i-lucide-users"
              :title="t('availability.sent.no-groups')"
              :description="t('availability.sent.no-groups-help')"
            />
            <AvailabilityRequestForm
              v-else
              :groups="d.groups"
              :today="d.today"
              :default-due="d.defaultDue"
              @saved="sent"
            />
          </template>
        </USlideover>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
