<!-- Poll results (S8, rule F8): tallies for each time as answers arrive, each person's answers, who
     has not answered; "Choose this time" settles it and "Give up" ends it. Everyone asked is told. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FindOptions } from '../../../composables/useFindATime'
import type { PollSlot, PollView } from '../../../composables/usePolls'

const route = useRoute()
const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal, phrase } = useRefusal()
const { confirm } = useConfirm()
const words = usePollWords()

const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<PollView>(() => `/api/availability/polls/${id.value}`, { key: `availability:poll:${id.value}` })
const p = computed(() => data.value?.poll)
const options = await useAPI<FindOptions>('/api/availability/find/options', { key: 'availability:find-options' })
const decided = computed(() => data.value?.slots.find(s => s.id === p.value?.decidedSlotId))
const arranging = ref(false)
async function arranged(meetingId: string) {
  arranging.value = false
  await navigateTo(`/members/availability/meetings/${meetingId}`)
}
const people = computed(() => data.value?.people ?? [])
const answered = computed(() => people.value.filter(x => Object.keys(x.answers).length).length)
const facts = computed(() => [
  { label: t('availability.poll.asked'), value: String(people.value.length) },
  { label: t('availability.poll.answered'), value: String(answered.value) },
  { label: t('availability.poll.waiting'), value: String(people.value.length - answered.value) },
])
const tally = (s: PollSlot) => {
  const c = data.value?.tallies?.[s.id]
  return c ? t('availability.poll.tally', { yes: c.yes, maybe: c['if-need-be'], no: c.no }) : ''
}
type Row = PollView['people'] extends (infer R)[] | undefined ? R : never
const columns = computed<TableColumn<Row>[]>(() => [
  { accessorKey: 'name', header: t('availability.poll.person') },
  ...(data.value?.slots ?? []).map(s => ({ id: s.id, header: words.when(s) })),
])

async function act(path: string, body: object, done: string) {
  try {
    await $api(`/api/availability/polls/${id.value}/${path}`, { method: 'POST', body })
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), description: phrase(refusal.remedy), color: 'error' })
  }
}
async function decide(s: PollSlot) {
  if (!await confirm({ verb: t('availability.poll.decide'), thing: words.when(s), consequence: t('availability.poll.decide-help') })) return
  await act('decide', { slotId: s.id }, t('availability.poll.decided-done'))
}
async function abandon() {
  if (!await confirm({ verb: t('availability.poll.abandon'), thing: p.value?.title ?? '', consequence: t('availability.poll.abandon-help') })) return
  await act('abandon', {}, t('availability.poll.abandoned-done'))
}
</script>

<template>
  <PageFrame
    :title="p?.title ?? t('availability.poll.title')"
    :description="p ? t('availability.poll.answers-by', { due: dates.dateTime(p.answersBy) }) : undefined"
    :trail="[{ label: t('availability.find.title'), to: '/members/find-a-time' }]"
  >
    <template
      v-if="p"
      #status
    >
      <StatusBadge
        :tone="words.stateTone(p.state)"
        :label="words.state(p)"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-6">
          <FactStrip
            :facts="facts"
            framed
            row
          />
          <UAlert
            v-if="decided && d.organiser"
            :title="t('availability.poll.decided-on', { when: words.when(decided) })"
            icon="i-lucide-calendar-check"
            color="success"
            variant="subtle"
            :actions="d.poll.meetingId
              ? [{ label: t('availability.meeting.open'), to: `/members/availability/meetings/${d.poll.meetingId}`, color: 'neutral', variant: 'outline' }]
              : options.data.value?.arrange ? [{ label: t('availability.meeting.arrange'), icon: 'i-lucide-calendar-plus', color: 'neutral', variant: 'outline', onClick: () => { arranging = true } }] : []"
          />
          <PageSection
            :title="t('availability.poll.times')"
            :description="t('availability.poll.times-help')"
          >
            <RecordList flush>
              <RecordListItem
                v-for="s in d.slots"
                :key="s.id"
                :icon="s.id === d.poll.decidedSlotId ? 'i-lucide-calendar-check' : 'i-lucide-clock'"
                :name="words.when(s)"
                :description="tally(s)"
              >
                <StatusBadge
                  v-if="s.id === d.poll.decidedSlotId"
                  tone="success"
                  :label="t('availability.poll.chosen')"
                />
                <template
                  v-if="d.poll.state === 'polling' && d.organiser"
                  #trailing
                >
                  <UButton
                    :label="t('availability.poll.decide')"
                    color="neutral"
                    variant="outline"
                    @click="decide(s)"
                  />
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            :title="t('availability.poll.people')"
            :description="t('availability.poll.people-help')"
          >
            <UTable
              :data="people"
              :columns="columns"
              :caption="t('availability.poll.people')"
            >
              <template #name-cell="{ row }">
                {{ row.original.name || t('availability.sent.former') }}<span
                  v-if="row.original.must"
                  class="text-muted"
                >, {{ t('availability.find.must').toLowerCase() }}</span>
              </template>
              <template
                v-for="s in d.slots"
                :key="s.id"
                #[`${s.id}-cell`]="{ row }"
              >
                <StatusBadge
                  v-if="row.original.answers[s.id]"
                  :tone="words.voteTone(row.original.answers[s.id]!)"
                  :label="words.vote(row.original.answers[s.id]!)"
                />
                <span
                  v-else
                  class="text-muted"
                >{{ t('availability.poll.no-answer') }}</span>
              </template>
            </UTable>
          </PageSection>
          <div
            v-if="d.poll.state === 'polling' && d.organiser"
            class="flex justify-end"
          >
            <UButton
              icon="i-lucide-circle-stop"
              :label="t('availability.poll.abandon')"
              color="neutral"
              variant="outline"
              @click="abandon"
            />
          </div>
        </div>
      </template>
    </DataBoundary>
    <USlideover
      v-model:open="arranging"
      :title="t('availability.meeting.arrange')"
      :description="t('availability.meeting.arrange-poll-help')"
    >
      <template #body>
        <AvailabilityMeetingForm
          v-if="decided && p && options.data.value"
          :start="{ title: p.title, date: decided.date, start: decided.start, end: decided.end }"
          :today="options.data.value.today"
          :step="options.data.value.grid.step"
          :people="{ findId: p.id, groupIds: [] }"
          @saved="arranged"
        />
      </template>
    </USlideover>
  </PageFrame>
</template>
