<!-- K4's Places and Waiting list tabs: who has a place, or who waits for one in order. Before the
     session starts, whoever gives places can take one away; a freed place goes to the first waiting. -->
<script setup lang="ts">
import type { Place } from '../../server/sessions'

const props = defineProps<{ places: Place[], waiting?: boolean, manage: boolean, started: boolean, sessionName: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { day } = useDates()
const act = useTrainingAct()
const toast = useToast()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const nameOf = (p: Place) => p.name ?? t('training.teaching.no-name')
const TONE = { booked: 'success', attended: 'success', absent: 'neutral', waiting: 'neutral', cancelled: 'neutral' } as const
const removable = (p: Place) => props.manage && !props.started && (p.state === 'booked' || p.state === 'waiting')

async function remove(p: Place) {
  const key = props.waiting ? 'training.session-record.unwait' : 'training.session-record.unbook'
  const yes = await confirm({
    verb: t(`${key}.verb`),
    thing: t(`${key}.thing`, { name: nameOf(p), session: props.sessionName }),
    consequence: t(`${key}.consequence`),
    button: t(`${key}.button`),
  })
  if (!yes) return
  refusal.value = null
  try {
    await act(`/api/training/places/${encodeURIComponent(p.id)}/cancel`, { method: 'POST', body: {} })
    toast.add({ title: t(`${key}.done`, { name: nameOf(p) }), color: 'success' })
    emit('changed')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <div class="space-y-4">
    <RefusalNotice :refusal="refusal" />
    <RecordList
      v-if="places.length"
      :label="t(waiting ? 'training.session-record.tab.waiting' : 'training.session-record.tab.places')"
    >
      <RecordListItem
        v-for="(p, i) in places"
        :key="p.id"
        icon="i-lucide-user"
        :name="nameOf(p)"
        :description="waiting && p.waitingSince ? t('training.session-record.in-line', { position: i + 1, day: day(p.waitingSince) }) : undefined"
      >
        <div class="flex items-center gap-2">
          <StatusBadge
            v-if="!waiting"
            :tone="TONE[p.state]"
            :label="t(`training.session-record.place.${p.state}`)"
          />
          <RowActions
            v-if="removable(p)"
            :label="t('training.session-record.place-actions', { name: nameOf(p) })"
            :items="[{ label: t(waiting ? 'training.session-record.unwait.button' : 'training.session-record.unbook.button'), icon: 'i-lucide-user-minus', onSelect: () => remove(p) }]"
          />
        </div>
      </RecordListItem>
    </RecordList>
    <EmptyState
      v-else
      :icon="waiting ? 'i-lucide-hourglass' : 'i-lucide-users'"
      :title="t(waiting ? 'training.session-record.no-waiting' : 'training.session-record.no-places')"
    />
  </div>
</template>
