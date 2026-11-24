<!-- K2's Trainers tab (TR-04): who may teach the course and sign people off on it. A manager adds a
     person with the picker and takes one off from the row; taking one off can be undone. -->
<script setup lang="ts">
import type { Trainer } from '../../server/courses'

const props = defineProps<{ courseId: string, trainers: Trainer[], manage: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { day } = useDates()
const act = useTrainingAct()
const { offer } = useUndo()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const chosen = ref<string | undefined>()
const adding = ref(false)
const base = computed(() => `/api/training/courses/${encodeURIComponent(props.courseId)}/trainers`)
const add = (accountId: string) => act(base.value, { method: 'POST', body: { accountId } })

async function addChosen() {
  if (!chosen.value) return
  refusal.value = null
  adding.value = true
  try {
    await add(chosen.value)
    chosen.value = undefined
    emit('changed')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    adding.value = false
  }
}

async function remove(trainer: Trainer) {
  refusal.value = null
  try {
    await act(`${base.value}/${encodeURIComponent(trainer.accountId)}`, { method: 'DELETE', body: {} })
    emit('changed')
    offer(t('training.trainers.removed', { name: trainer.name ?? t('training.teaching.no-name') }), async () => {
      await add(trainer.accountId)
      emit('changed')
    })
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
      v-if="trainers.length"
      :label="t('training.course-record.tab.trainers')"
    >
      <RecordListItem
        v-for="x in trainers"
        :key="x.accountId"
        icon="i-lucide-user"
        :name="x.name ?? t('training.teaching.no-name')"
        :description="t('training.trainers.since', { day: day(x.addedAt) })"
      >
        <RowActions
          v-if="manage"
          :label="t('training.trainers.actions', { name: x.name ?? t('training.teaching.no-name') })"
          :items="[{ label: t('training.trainers.remove'), icon: 'i-lucide-user-minus', onSelect: () => remove(x) }]"
        />
      </RecordListItem>
    </RecordList>
    <EmptyState
      v-else
      icon="i-lucide-users"
      :title="t('training.trainers.none.title')"
      :description="t('training.trainers.none.description')"
    />
    <div
      v-if="manage"
      class="flex flex-wrap items-end gap-2"
    >
      <UFormField
        :label="t('training.trainers.add-label')"
        class="min-w-64 grow"
      >
        <PersonPicker
          v-model="chosen"
          endpoint="/api/training/console/people"
          :exclude="trainers.map(x => x.accountId)"
        />
      </UFormField>
      <UButton
        icon="i-lucide-user-plus"
        :label="t('training.trainers.add')"
        :disabled="!chosen"
        :loading="adding"
        @click="addChosen"
      />
    </div>
  </div>
</template>
