<!-- Asked of me (S4): the requests asking this person to check their availability, open ones first,
     each with its period, its answer date and where the person stands. -->
<script setup lang="ts">
import type { AskedRequest } from '../../../../composables/useMyAvailability'
import type { MeetingRow } from '../../../../composables/useMeetings'
import type { PollRow } from '../../../../composables/usePolls'

const { t } = useT()
const dates = useDates()
const states = useRequestStates()
const { data, status, error, refresh } = await useAPI<{ today: string, requests: AskedRequest[] }>('/api/availability/requests', { key: 'availability:asked' })

const polls = await useAPI<{ polls: PollRow[] }>('/api/availability/polls', { key: 'availability:polls-asked' })
const meetings = await useAPI<{ meetings: MeetingRow[] }>('/api/availability/meetings', { key: 'availability:meetings-mine' })
const mwords = useMeetingWords()
const upcoming = computed(() => meetings.data.value?.meetings ?? [])
const openPolls = computed(() => (polls.data.value?.polls ?? []).filter(p => p.open))
const pollLine = (p: PollRow) => t(p.answered ? 'availability.poll.asked-answered' : 'availability.poll.asked-line', { due: dates.dateTime(p.answersBy) })
const open = computed(() => (data.value?.requests ?? []).filter(r => r.open))
const closed = computed(() => (data.value?.requests ?? []).filter(r => !r.open))
const line = (r: AskedRequest) => t('availability.asked.line', { period: dates.range(r.from, r.to), due: dates.day(r.dueOn) })
</script>

<template>
  <PageFrame
    :title="t('availability.asked.title')"
    :description="t('availability.asked.description')"
    width="reading"
    :trail="[{ label: t('availability.mine.title'), to: '/members/availability' }]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <PageSection
          v-if="upcoming.length"
          :title="t('availability.meeting.upcoming')"
          class="mb-8"
        >
          <RecordList flush>
            <RecordListItem
              v-for="m in upcoming"
              :key="m.id"
              :to="`/members/availability/meetings/${m.id}`"
              icon="i-lucide-calendar-days"
              :name="m.title"
              :description="mwords.when(m)"
              :muted="m.state === 'cancelled'"
            >
              <StatusBadge
                v-if="m.state === 'cancelled'"
                tone="neutral"
                :label="t('availability.meeting.cancelled')"
              />
              <StatusBadge
                v-else-if="m.response"
                :tone="mwords.tone(m.response)"
                :label="mwords.response(m.response)"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="openPolls.length"
          :title="t('availability.poll.asked-of-me')"
          class="mb-8"
        >
          <RecordList flush>
            <RecordListItem
              v-for="p in openPolls"
              :key="p.id"
              :to="`/members/availability/polls/${p.id}`"
              icon="i-lucide-vote"
              :name="p.title"
              :description="pollLine(p)"
            >
              <StatusBadge
                :tone="p.answered ? 'success' : 'info'"
                :label="p.answered ? t('availability.asked.states.answered') : t('availability.asked.states.asked')"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
        <EmptyState
          v-if="!d.requests.length && !openPolls.length && !upcoming.length"
          icon="i-lucide-inbox"
          :title="t('availability.asked.none')"
          :description="t('availability.asked.none-help')"
        />
        <div
          v-else
          class="space-y-8"
        >
          <PageSection
            v-if="open.length"
            :title="t('availability.asked.open')"
          >
            <RecordList flush>
              <RecordListItem
                v-for="r in open"
                :key="r.id"
                :to="`/members/availability/requests/${r.id}`"
                icon="i-lucide-calendar-check"
                :name="r.title"
                :description="line(r)"
              >
                <StatusBadge
                  :tone="states.tone(r.state)"
                  :label="states.label(r.state)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="closed.length"
            :title="t('availability.asked.closed')"
          >
            <RecordList flush>
              <RecordListItem
                v-for="r in closed"
                :key="r.id"
                :to="`/members/availability/requests/${r.id}`"
                icon="i-lucide-calendar"
                :name="r.title"
                :description="line(r)"
                muted
              >
                <StatusBadge
                  :tone="states.tone(r.state)"
                  :label="states.label(r.state)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
