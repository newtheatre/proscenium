<!-- Who is on tonight (Front of house specification, part 5, "Live mode"; FH-21): each duty with its
     people, whether they have arrived, and a flag for anyone past their call. Someone leading marks
     people arrived; anyone marks themselves. -->
<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

interface Person { assignmentId: string, name: string, state: string, checkedInAt: number | null, notArrived: boolean }
interface Board {
  performance: { id: string, title: string, startsAt: number, venueName: string }
  shifts: { id: string, dutyName: string, isLead: boolean, callAt: number, places: number, people: Person[] }[]
  mine: string | null
  can: { lead: boolean }
}
const REFRESH = 30_000 // not-policy: how often the list reads again

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { time } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const { data, status, error, refresh } = await useAPI<Board>(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/tonight`, { key: `front-of-house:board:${id.value}` })
useIntervalFn(() => { void refresh() }, REFRESH)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref<string | null>(null)

async function arrived(p: Person) {
  refusal.value = null
  busy.value = p.assignmentId
  try {
    await write(`/api/front-of-house/assignments/${encodeURIComponent(p.assignmentId)}/check-in`, { method: 'POST', body: {} })
    toast.add({ title: t('front-of-house.live.marked-arrived', { name: p.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = null
  }
}
const context = computed(() => data.value ? [data.value.performance.title, time(data.value.performance.startsAt)].join(' · ') : undefined)
</script>

<template>
  <PageLive
    :title="t('front-of-house.live.people')"
    :context="context"
    :back="`/live/front-of-house/${encodeURIComponent(id)}`"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-3xl space-y-6">
          <RefusalNotice
            v-if="refusal"
            :refusal="refusal"
          />
          <section
            v-for="s in d.shifts"
            :key="s.id"
            :aria-labelledby="`fh-duty-${s.id}`"
          >
            <h2
              :id="`fh-duty-${s.id}`"
              class="mb-2 text-lg font-semibold text-highlighted"
            >
              {{ s.dutyName }}
              <span class="text-sm font-normal text-muted">{{ t('front-of-house.shift.call', { when: time(s.callAt) }) }}</span>
            </h2>
            <p
              v-if="!s.people.length"
              class="text-muted"
            >
              {{ t('front-of-house.live.nobody') }}
            </p>
            <RecordList
              v-else
              :label="s.dutyName"
            >
              <RecordListItem
                v-for="p in s.people"
                :key="p.assignmentId"
                icon="i-lucide-user"
                :name="p.name"
              >
                <template #description>
                  <span v-if="p.checkedInAt">{{ t('front-of-house.live.arrived-at', { when: time(p.checkedInAt) }) }}</span>
                  <span
                    v-else-if="p.notArrived"
                    class="text-warning"
                  >{{ t('front-of-house.live.not-arrived-yet') }}</span>
                </template>
                <StatusBadge
                  v-if="p.state === 'checked_in'"
                  tone="success"
                  :label="t('front-of-house.assignment-states.checked_in')"
                />
                <UButton
                  v-else-if="d.can.lead || p.assignmentId === d.mine"
                  size="xl"
                  icon="i-lucide-check"
                  :loading="busy === p.assignmentId"
                  :label="p.assignmentId === d.mine ? t('front-of-house.live.im-here') : t('front-of-house.live.arrived')"
                  :aria-label="p.assignmentId === d.mine ? undefined : t('front-of-house.live.mark-arrived', { name: p.name })"
                  @click="arrived(p)"
                />
              </RecordListItem>
            </RecordList>
          </section>
          <EmptyState
            v-if="!d.shifts.length"
            icon="i-lucide-users"
            :title="t('front-of-house.live.no-shifts.title')"
            :description="t('front-of-house.live.no-shifts.description')"
          />
        </div>
      </template>
    </DataBoundary>
  </PageLive>
</template>
