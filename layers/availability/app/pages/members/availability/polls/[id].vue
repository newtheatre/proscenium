<!-- Answer a poll (S9, rule F7): yes, if need be or no for each time, beside the person's own
     availability then; one save, changeable until the poll closes. Nobody else's answers show. -->
<script setup lang="ts">
import { z } from 'zod'
import { VOTE_ORDER, type PollView, type Vote } from '../../../../composables/usePolls'

const route = useRoute()
const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal } = useRefusal()
const words = usePollWords()

const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<PollView>(() => `/api/availability/polls/${id.value}`, { key: `availability:poll:${id.value}` })
if (data.value?.organiser && !data.value.asked) await navigateTo(`/members/find-a-time/${id.value}`, { replace: true })

const answers = reactive<Record<string, Vote | undefined>>({})
watch(data, (d) => {
  for (const s of d?.slots ?? []) answers[s.id] = d!.mine[s.id]
}, { immediate: true })
const schema = z.object({}).catchall(z.enum(VOTE_ORDER, { message: t('availability.poll.answer-needed') }))
const items = VOTE_ORDER.map(v => ({ value: v, label: words.vote(v) }))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const decided = computed(() => data.value?.slots.find(s => s.id === data.value?.poll.decidedSlotId))

async function save() {
  refusal.value = null
  try {
    await $api(`/api/availability/polls/${id.value}/answers`, { method: 'PUT', body: { answers: Object.entries(answers).map(([slotId, answer]) => ({ slotId, answer })) } })
    toast.add({ title: t('availability.poll.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="data?.poll.title ?? t('availability.poll.title')"
    :description="data ? t('availability.poll.from', { organiser: data.poll.organiser || t('availability.sent.former'), due: dates.dateTime(data.poll.answersBy) }) : undefined"
    width="reading"
    :trail="[{ label: t('availability.asked.title'), to: '/members/availability/requests' }]"
  >
    <template
      v-if="data"
      #status
    >
      <StatusBadge
        :tone="words.stateTone(data.poll.state)"
        :label="words.state(data.poll)"
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
            v-if="decided"
            :title="t('availability.poll.decided-on', { when: words.when(decided) })"
            icon="i-lucide-calendar-check"
            color="success"
            variant="subtle"
          />
          <p class="text-sm text-muted">
            {{ t('availability.poll.private') }}
          </p>
          <UForm
            :schema="schema"
            :state="answers"
            :disabled="!d.poll.open"
            class="space-y-4"
            novalidate
            @submit="save"
          >
            <PageSection :title="t('availability.poll.times')">
              <ul class="divide-y divide-default">
                <li
                  v-for="s in d.slots"
                  :key="s.id"
                  class="py-3"
                >
                  <UFormField
                    :name="s.id"
                    :label="words.when(s)"
                    :description="t('availability.poll.marked', { level: t(`availability.levels.${d.myLevels[s.id] ?? 'unknown'}`) })"
                  >
                    <URadioGroup
                      v-model="answers[s.id]"
                      :items="items"
                      orientation="horizontal"
                      :legend="words.when(s)"
                      :ui="{ legend: 'sr-only' }"
                    />
                  </UFormField>
                </li>
              </ul>
            </PageSection>
            <RefusalNotice :refusal="refusal" />
            <UButton
              v-if="d.poll.open"
              type="submit"
              icon="i-lucide-check"
              :label="t('availability.poll.save')"
              loading-auto
            />
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('availability.poll.closed-help') }}
            </p>
          </UForm>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
