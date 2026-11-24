<!-- Arrange or change a meeting (M1, M3): title, day, times, place and agenda. Arranging takes its
     people from a poll or from the groups chosen on Find a time; changing the time resets answers. -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { clockOf, DAY_MINUTES, rowStarts } from '../../shared/grid'
import { minutesOf } from '../../shared/levels'

const props = defineProps<{
  /** The meeting being changed, or what to prefill a new one with. */
  start: { title?: string, date: string, start: number, end: number, place?: string | null, notes?: string | null }
  today: string
  step: number
  /** Where a new meeting's people come from; absent when changing one. */
  people?: { findId: string | null, groupIds: string[] }
  meetingId?: string
}>()
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()

const TITLE_MAX = 80 // not-policy: as the table's CHECK
const PLACE_MAX = 120 // not-policy: as the table's CHECK
const NOTES_MAX = 2000 // not-policy: as the table's CHECK
const schema = z.object({
  title: z.string().trim().min(1, t('availability.sent.title-needed')).max(TITLE_MAX),
  date: z.string().min(1, t('availability.meeting.date-needed')),
  from: z.string(),
  until: z.string(),
  place: z.string().max(PLACE_MAX),
  notes: z.string().max(NOTES_MAX),
  tell: z.boolean(),
}).refine(v => minutesOf(v.until) > minutesOf(v.from), { path: ['until'], message: t('availability.entry.until-after') })
type State = z.infer<typeof schema>

const state = reactive<State>({ title: props.start.title ?? '', date: props.start.date, from: clockOf(props.start.start), until: clockOf(props.start.end), place: props.start.place ?? '', notes: props.start.notes ?? '', tell: false })
const times = computed(() => rowStarts(props.step).map(m => clockOf(m)))
const ends = computed(() => [...rowStarts(props.step).slice(1), DAY_MINUTES].map(m => clockOf(m)))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function save(event: FormSubmitEvent<State>) {
  refusal.value = null
  const v = event.data
  const body = { title: v.title, date: v.date, start: minutesOf(v.from), end: minutesOf(v.until), place: v.place.trim() || null, notes: v.notes.trim() || null }
  try {
    if (props.meetingId) {
      await $api(`/api/availability/meetings/${props.meetingId}`, { method: 'PUT', body: { ...body, tell: v.tell } })
      emit('saved', props.meetingId)
    }
    else {
      const made = await $api<{ meetingId: string }>('/api/availability/meetings', { method: 'POST', body: { ...body, groupIds: props.people?.findId ? [] : props.people?.groupIds ?? [], accountIds: [], findId: props.people?.findId ?? null } })
      emit('saved', made.meetingId)
    }
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
    @submit="save"
  >
    <UFormField
      :label="t('availability.sent.title-label')"
      :help="t('availability.meeting.title-help')"
      name="title"
      required
    >
      <UInput
        v-model="state.title"
        :maxlength="TITLE_MAX"
      />
    </UFormField>
    <UFormField
      :label="t('availability.meeting.date')"
      name="date"
      required
    >
      <FieldDate
        v-model="state.date"
        :min="today"
      />
    </UFormField>
    <div class="flex gap-3">
      <UFormField
        :label="t('availability.find.from')"
        name="from"
      >
        <USelect
          v-model="state.from"
          :items="times"
          class="w-28"
        />
      </UFormField>
      <UFormField
        :label="t('availability.find.until')"
        name="until"
      >
        <USelect
          v-model="state.until"
          :items="ends"
          class="w-28"
        />
      </UFormField>
    </div>
    <UFormField
      :label="t('availability.meeting.place')"
      :hint="t('availability.entry.optional')"
      name="place"
    >
      <UInput
        v-model="state.place"
        :maxlength="PLACE_MAX"
      />
    </UFormField>
    <UFormField
      :label="t('availability.meeting.notes')"
      :hint="t('availability.entry.optional')"
      :help="t('availability.meeting.notes-help')"
      name="notes"
    >
      <UTextarea
        v-model="state.notes"
        :maxlength="NOTES_MAX"
        :rows="4"
      />
    </UFormField>
    <UCheckbox
      v-if="meetingId"
      v-model="state.tell"
      :label="t('availability.meeting.tell')"
      :description="t('availability.meeting.tell-help')"
    />
    <RefusalNotice :refusal="refusal" />
    <UButton
      type="submit"
      :icon="meetingId ? 'i-lucide-check' : 'i-lucide-calendar-plus'"
      :label="meetingId ? t('availability.meeting.save') : t('availability.meeting.arrange')"
      loading-auto
    />
  </UForm>
</template>
