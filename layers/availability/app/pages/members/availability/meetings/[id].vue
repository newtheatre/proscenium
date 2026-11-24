<!-- A meeting (S12, rules M2 to M4): time, place and agenda; Going or Not going for invitees; the
     organiser sees everyone's answer and can change or cancel it. -->
<script setup lang="ts">
import type { MeetingView, Response } from '../../../../composables/useMeetings'

const route = useRoute()
const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal, phrase } = useRefusal()
const { confirm } = useConfirm()
const words = useMeetingWords()

const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<MeetingView>(() => `/api/availability/meetings/${id.value}`, { key: `availability:meeting:${id.value}` })
const m = computed(() => data.value?.meeting)
const open = computed(() => m.value?.state === 'arranged' && !m.value.over)
const facts = computed(() => (['going', 'pending', 'not-going'] as Response[]).map(r => ({ label: words.response(r), value: String(data.value?.counts[r] ?? 0) })))
const changing = ref(false)

async function act(path: string, body: object, done: string) {
  try {
    await $api(`/api/availability/meetings/${id.value}/${path}`, { method: 'POST', body })
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), description: phrase(refusal.remedy), color: 'error' })
  }
}
const answer = (response: Exclude<Response, 'pending'>) => act('respond', { response }, t('availability.meeting.answered'))
async function cancel() {
  if (!await confirm({ verb: t('availability.meeting.cancel'), thing: m.value?.title ?? '', consequence: t('availability.meeting.cancel-help') })) return
  await act('cancel', { reason: null }, t('availability.meeting.cancelled-done'))
}
async function saved() {
  changing.value = false
  toast.add({ title: t('availability.meeting.saved'), color: 'success' })
  await refresh()
}
</script>

<template>
  <PageFrame
    :title="m?.title ?? t('availability.meeting.title')"
    :description="m ? words.when(m) : undefined"
    width="reading"
    :trail="[{ label: t('availability.asked.title'), to: '/members/availability/requests' }]"
  >
    <template
      v-if="m"
      #status
    >
      <StatusBadge
        v-if="m.state === 'cancelled'"
        tone="neutral"
        :label="t('availability.meeting.cancelled')"
      />
      <StatusBadge
        v-else-if="data?.mine"
        :tone="words.tone(data.mine)"
        :label="words.response(data.mine)"
      />
    </template>
    <template
      v-if="open && data?.organiser"
      #primary
    >
      <UButton
        icon="i-lucide-pencil"
        :label="t('availability.meeting.change')"
        @click="changing = true"
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
          <UAlert
            v-if="d.meeting.state === 'cancelled'"
            :title="t('availability.meeting.cancelled')"
            :description="d.meeting.cancelledReason ?? undefined"
            icon="i-lucide-calendar-x"
            color="neutral"
            variant="subtle"
          />
          <AvailabilityUnder18Notes
            v-if="d.under18"
            :late="d.under18.late"
            :one-to-one="d.under18.oneToOne"
          />
          <FactStrip
            :facts="[
              { label: t('availability.meeting.when'), value: words.when(d.meeting) },
              { label: t('availability.meeting.place'), value: d.meeting.place || t('availability.meeting.no-place') },
              { label: t('availability.meeting.organiser'), value: d.meeting.organiser || t('availability.sent.former') },
            ]"
            framed
          />
          <PageSection
            v-if="d.meeting.notes"
            :title="t('availability.meeting.notes')"
          >
            <p class="whitespace-pre-line text-sm">
              {{ d.meeting.notes }}
            </p>
          </PageSection>
          <PageSection
            v-if="d.mine && open"
            :title="t('availability.meeting.going-question')"
          >
            <div class="flex flex-wrap gap-3">
              <UButton
                icon="i-lucide-check"
                :label="t('availability.meeting.responses.going')"
                :variant="d.mine === 'going' ? 'solid' : 'outline'"
                :aria-pressed="d.mine === 'going'"
                @click="answer('going')"
              />
              <UButton
                icon="i-lucide-x"
                :label="t('availability.meeting.responses.not-going')"
                color="neutral"
                :variant="d.mine === 'not-going' ? 'solid' : 'outline'"
                :aria-pressed="d.mine === 'not-going'"
                @click="answer('not-going')"
              />
              <UButton
                icon="i-lucide-calendar-days"
                :label="t('availability.meeting.on-my-week')"
                :to="{ path: '/members/availability', query: { from: d.local.date } }"
                color="neutral"
                variant="link"
              />
            </div>
          </PageSection>
          <PageSection :title="t('availability.meeting.invited')">
            <FactStrip
              :facts="facts"
              framed
              row
            />
            <RecordList
              v-if="d.invitees"
              flush
              class="mt-4"
            >
              <RecordListItem
                v-for="p in d.invitees"
                :key="p.accountId"
                icon="i-lucide-user"
                :name="p.name || t('availability.sent.former')"
              >
                <StatusBadge
                  :tone="words.tone(p.response)"
                  :label="words.response(p.response)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <div
            v-if="open && d.organiser"
            class="flex justify-end"
          >
            <UButton
              icon="i-lucide-calendar-x"
              :label="t('availability.meeting.cancel')"
              color="neutral"
              variant="outline"
              @click="cancel"
            />
          </div>
        </div>
      </template>
    </DataBoundary>
    <USlideover
      v-model:open="changing"
      :title="t('availability.meeting.change')"
      :description="t('availability.meeting.change-help')"
    >
      <template #body>
        <AvailabilityMeetingForm
          v-if="data"
          :start="{ title: data.meeting.title, date: data.local.date, start: data.local.start, end: data.local.end, place: data.meeting.place, notes: data.meeting.notes }"
          :today="data.local.today"
          :step="data.local.step"
          :meeting-id="data.meeting.id"
          @saved="saved"
        />
      </template>
    </USlideover>
  </PageFrame>
</template>
