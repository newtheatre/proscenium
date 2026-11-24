<!-- One request I sent (S11): who has answered, who is still asked, who lapsed or was withdrawn; "Remind
     now" at most once a day; "Close", which stops reminders and nothing else (R7). -->
<script setup lang="ts">
import type { AskedState, RequestView } from '../../../../composables/useRequests'

const route = useRoute()
const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal, phrase } = useRefusal()
const { confirm } = useConfirm()
const states = useRequestStates()

const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<RequestView>(() => `/api/availability/requests/${id.value}`, { key: `availability:request:${id.value}` })
const r = computed(() => data.value?.request)
const ORDER: AskedState[] = ['asked', 'lapsed', 'answered', 'withdrawn']
const facts = computed(() => ORDER.map(s => ({ label: states.label(s), value: String(data.value?.counts[s] ?? 0) })))
const people = computed(() => [...data.value?.people ?? []].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state)))

async function act(path: string, body: object, done: string) {
  try {
    await $api(`/api/availability/requests/${id.value}/${path}`, { method: 'POST', body })
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), description: phrase(refusal.remedy), color: 'error' })
  }
}

const marking = ref<{ accountId: string, name: string } | null>(null)
function actions(p: { accountId: string, name: string, state: AskedState }) {
  const name = p.name || t('availability.sent.former')
  return [
    ...(data.value?.onBehalf ? [{ label: t('availability.behalf.add'), icon: 'i-lucide-calendar-x', onSelect: () => { marking.value = { accountId: p.accountId, name } } }] : []),
    ...(data.value?.request.open && p.state !== 'withdrawn' ? [{ label: t('availability.sent.withdraw'), icon: 'i-lucide-user-minus', onSelect: () => withdraw(p) }] : []),
  ]
}

const remind = () => act('remind', {}, t('availability.sent.reminded'))
async function close() {
  if (!await confirm({ verb: t('availability.sent.close'), thing: r.value?.title ?? '', consequence: t('availability.sent.close-help') })) return
  await act('close', {}, t('availability.sent.closed-done'))
}
async function withdraw(p: { accountId: string, name: string }) {
  if (!await confirm({ verb: t('availability.sent.withdraw'), thing: p.name || t('availability.sent.former'), consequence: t('availability.sent.withdraw-help') })) return
  await act('withdraw', { accountId: p.accountId }, t('availability.sent.withdrawn'))
}
</script>

<template>
  <PageFrame
    :title="r?.title ?? t('availability.sent.title')"
    :description="r ? t('availability.asked.line', { period: dates.range(r.from, r.to), due: dates.day(r.dueOn) }) : undefined"
    :trail="[{ label: t('availability.sent.title'), to: '/members/find-a-time/requests' }]"
  >
    <template
      v-if="r"
      #status
    >
      <StatusBadge
        :tone="r.open ? 'info' : 'neutral'"
        :label="r.open ? t('availability.sent.open') : t('availability.sent.closed')"
      />
    </template>
    <template
      v-if="r?.open && data?.organiser"
      #primary
    >
      <UButton
        icon="i-lucide-bell"
        :label="t('availability.sent.remind')"
        :disabled="!data.counts.asked"
        loading-auto
        @click="remind"
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
            v-if="d.request.message"
            :title="t('availability.asked.message')"
            :description="d.request.message"
            icon="i-lucide-message-square"
            color="neutral"
            variant="subtle"
          />
          <p
            v-if="d.request.remindedAt"
            class="text-sm text-muted"
          >
            {{ t('availability.sent.last-reminded', { when: dates.dateTime(d.request.remindedAt) }) }}
          </p>
          <PageSection :title="t('availability.sent.people')">
            <EmptyState
              v-if="!people.length"
              icon="i-lucide-users"
              :title="t('availability.sent.nobody')"
            />
            <RecordList
              v-else
              flush
            >
              <RecordListItem
                v-for="p in people"
                :key="p.accountId"
                icon="i-lucide-user"
                :name="p.name || t('availability.sent.former')"
                :description="p.answeredAt ? t('availability.sent.answered-at', { when: dates.dateTime(p.answeredAt) }) : undefined"
                :muted="p.state === 'withdrawn'"
              >
                <StatusBadge
                  :tone="states.tone(p.state)"
                  :label="states.label(p.state)"
                />
                <template
                  v-if="actions(p).length"
                  #trailing
                >
                  <RowActions
                    :label="t('availability.sent.person-actions', { name: p.name || t('availability.sent.former') })"
                    :items="actions(p)"
                  />
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>
          <div
            v-if="d.request.open && !d.request.module && d.organiser"
            class="flex justify-end"
          >
            <UButton
              icon="i-lucide-circle-stop"
              :label="t('availability.sent.close')"
              color="neutral"
              variant="outline"
              @click="close"
            />
          </div>
        </div>
      </template>
    </DataBoundary>
    <USlideover
      :open="!!marking"
      :title="t('availability.behalf.title', { name: marking?.name ?? '' })"
      :description="t('availability.behalf.description')"
      @update:open="v => { if (!v) marking = null }"
    >
      <template #body>
        <AvailabilityOnBehalf
          v-if="marking"
          :account-id="marking.accountId"
          :name="marking.name"
        />
      </template>
    </USlideover>
  </PageFrame>
</template>
