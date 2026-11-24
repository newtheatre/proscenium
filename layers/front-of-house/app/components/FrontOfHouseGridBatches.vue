<!-- The batches still standing (FH-48), so one made by mistake can be removed: its untaken shifts are
     cancelled and the ones with people on them are listed back. -->
<script setup lang="ts">
interface Batch { id: string, title: string, venueName: string, days: string[], callTime: string, endTime: string, made: number, templateName: string }
interface Kept { shiftId: string, dutyName: string, callAt: number, placesTaken: number }

const props = defineProps<{ crewCallId: string | undefined }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()

const path = '/api/front-of-house/batches'
const { data, refresh } = await useAPI<{ batches: Batch[] }>(path, { key: 'front-of-house:batches', query: computed(() => ({ crewCallId: props.crewCallId })), immediate: false, default: () => ({ batches: [] }) })
const kept = ref<Kept[] | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, async (v) => {
  if (!v) return
  kept.value = null
  refusal.value = null
  await refresh()
})

async function remove(b: Batch) {
  refusal.value = null
  try {
    const done = await write<{ cancelled: number, kept: Kept[] }>(`${path}/${encodeURIComponent(b.id)}/remove`, { method: 'POST', body: {} })
    toast.add({ title: t('front-of-house.grid.batch-removed', { count: done.cancelled }), color: 'success' })
    kept.value = done.kept.length ? done.kept : null
    await refresh()
    emit('changed')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const describe = (b: Batch) => [
  b.venueName,
  b.templateName,
  dates.range(b.days[0]!, b.days[b.days.length - 1]!),
  t('front-of-house.rota.shift-times', { from: b.callTime, to: b.endTime }),
  t('front-of-house.crew-calls.shifts-count', { count: b.made }),
].join(' · ')
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('front-of-house.grid.batches')"
    :description="t('front-of-house.grid.batches-description')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <UAlert
          v-if="kept"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('front-of-house.grid.kept-title', { count: kept.length })"
          :description="kept.map(k => `${k.dutyName}, ${dates.dateTime(k.callAt)}`).join('; ')"
        />
        <RecordList
          v-if="data.batches.length"
          :label="t('front-of-house.grid.batches')"
        >
          <RecordListItem
            v-for="b in data.batches"
            :key="b.id"
            icon="i-lucide-layers"
            :name="b.title"
            :description="describe(b)"
          >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-trash-2"
              :label="t('front-of-house.grid.remove-batch')"
              :aria-label="t('front-of-house.grid.remove-batch-named', { name: b.title })"
              loading-auto
              @click="remove(b)"
            />
          </RecordListItem>
        </RecordList>
        <EmptyState
          v-else
          icon="i-lucide-layers"
          :title="t('front-of-house.grid.no-batches.title')"
          :description="t('front-of-house.grid.no-batches.description')"
        />
      </div>
    </template>
  </USlideover>
</template>
