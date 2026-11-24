<!-- Ask for availability (R1): the groups to ask, the period, the answer date and a message. The people
     asked are the groups' members, worked out on the server, and joiners are added while it is open. -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{ groups: { id: string, label: string, hint?: string }[], today: string, defaultDue: string }>()
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()

const TITLE_MAX = 80 // not-policy: as the table's CHECK
const MESSAGE_MAX = 1000 // not-policy: as the table's CHECK
const schema = z.object({
  title: z.string().trim().min(1, t('availability.sent.title-needed')).max(TITLE_MAX),
  groupIds: z.array(z.string()).min(1, t('availability.sent.groups-needed')),
  period: z.object({ start: z.string().min(1, t('availability.sent.period-needed')), end: z.string().min(1, t('availability.sent.period-needed')) }),
  dueOn: z.string().min(1, t('availability.sent.due-needed')),
  message: z.string().max(MESSAGE_MAX),
})
type State = z.infer<typeof schema>

const state = reactive<State>({ title: '', groupIds: [], period: { start: '', end: '' }, dueOn: props.defaultDue, message: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const items = computed(() => props.groups.map(g => ({ value: g.id, label: g.label, description: g.hint })))

async function save(event: FormSubmitEvent<State>) {
  refusal.value = null
  const v = event.data
  try {
    const made = await $api<{ requestId: string }>('/api/availability/requests', {
      method: 'POST',
      body: { title: v.title, groupIds: v.groupIds, accountIds: [], from: v.period.start, to: v.period.end, dueOn: v.dueOn, message: v.message.trim() || null },
    })
    emit('saved', made.requestId)
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
      :help="t('availability.sent.title-help')"
      name="title"
      required
    >
      <UInput
        v-model="state.title"
        :maxlength="TITLE_MAX"
      />
    </UFormField>
    <UFormField
      :label="t('availability.sent.groups')"
      :help="t('availability.sent.groups-help')"
      name="groupIds"
      required
    >
      <USelectMenu
        v-model="state.groupIds"
        :items="items"
        value-key="value"
        multiple
        :placeholder="t('availability.sent.groups-choose')"
      />
    </UFormField>
    <UFormField
      :label="t('availability.sent.period')"
      name="period"
      required
    >
      <FieldDateRange
        v-model="state.period"
        :min="today"
      />
    </UFormField>
    <UFormField
      :label="t('availability.sent.due')"
      :help="t('availability.sent.due-help')"
      name="dueOn"
      required
    >
      <FieldDate
        v-model="state.dueOn"
        :min="today"
      />
    </UFormField>
    <UFormField
      :label="t('availability.sent.message')"
      :hint="t('availability.entry.optional')"
      :help="t('availability.sent.message-help')"
      name="message"
    >
      <UTextarea
        v-model="state.message"
        :maxlength="MESSAGE_MAX"
        :rows="4"
      />
    </UFormField>
    <RefusalNotice :refusal="refusal" />
    <UButton
      type="submit"
      :label="t('availability.sent.send')"
      loading-auto
    />
  </UForm>
</template>
