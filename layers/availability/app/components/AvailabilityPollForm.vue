<!-- Send a poll (F7): a title and an answer date for the times picked on Find a time. The people are
     the find's, worked out again on the server; the organiser is not asked to answer. -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Choices } from '../composables/useFindATime'

const props = defineProps<{ choices: Choices, slots: { date: string, start: number, end: number }[], today: string }>()
const emit = defineEmits<{ sent: [id: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const words = usePollWords()

const TITLE_MAX = 80 // not-policy: as the table's CHECK
const schema = z.object({
  title: z.string().trim().min(1, t('availability.sent.title-needed')).max(TITLE_MAX),
  answersBy: z.string().min(1, t('availability.sent.due-needed')),
})
type State = z.infer<typeof schema>

const firstDay = computed(() => [...props.slots].map(s => s.date).sort()[0] ?? props.today)
const state = reactive<State>({ title: '', answersBy: firstDay.value })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function send(event: FormSubmitEvent<State>) {
  refusal.value = null
  const c = props.choices
  try {
    const made = await $api<{ pollId: string }>('/api/availability/polls', {
      method: 'POST',
      body: { title: event.data.title, answersBy: event.data.answersBy, groupIds: c.groupIds, accountIds: [], must: c.must, spaceIds: c.spaceIds, length: c.length, slots: props.slots.map(s => ({ date: s.date, start: s.start })) },
    })
    emit('sent', made.pollId)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    novalidate
    class="space-y-5"
    @submit="send"
  >
    <UFormField
      :label="t('availability.sent.title-label')"
      :help="t('availability.poll.title-help')"
      name="title"
      required
    >
      <UInput
        v-model="state.title"
        :maxlength="TITLE_MAX"
      />
    </UFormField>
    <UFormField
      :label="t('availability.poll.answers-by-label')"
      :help="t('availability.poll.answers-by-help')"
      name="answersBy"
      required
    >
      <FieldDate
        v-model="state.answersBy"
        :min="today"
      />
    </UFormField>
    <PageSection :title="t('availability.poll.times')">
      <ul class="space-y-1 text-sm">
        <li
          v-for="s in slots"
          :key="`${s.date}-${s.start}`"
        >
          {{ words.when(s) }}
        </li>
      </ul>
    </PageSection>
    <RefusalNotice :refusal="refusal" />
    <UButton
      type="submit"
      icon="i-lucide-send"
      :label="t('availability.poll.send')"
      loading-auto
    />
  </UForm>
</template>
