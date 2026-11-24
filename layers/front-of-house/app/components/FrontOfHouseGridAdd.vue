<!-- Add one draft shift in each picked duty cell (FH-48), at the times given, in the theatre's zone. -->
<script setup lang="ts">
import { parseDate, parseDateTime, toZoned } from '@internationalized/date'
import type { GridCell } from '../utils/rota-grid'

const props = defineProps<{ cells: GridCell[], crewCallId: string | undefined }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ done: [] }>()
const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()

const STARTING_PLACES = 2 // not-policy: a starting count, changed in the form
const form = ref({ title: '', places: STARTING_PLACES, callTime: '18:00', endTime: '23:00', signUp: true })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (v) => {
  if (v) refusal.value = null
})
const instant = (day: string, time: string, nextDay: boolean) =>
  toZoned(parseDateTime(`${nextDay ? parseDate(day).add({ days: 1 }).toString() : day}T${time}`), dates.zone.value).toDate().getTime()

async function add() {
  refusal.value = null
  const f = form.value
  try {
    for (const c of props.cells) {
      const body = { title: f.title.trim(), venueId: c.venueId, dutyId: c.dutyId, places: f.places, callAt: instant(c.day, f.callTime, false), endsAt: instant(c.day, f.endTime, f.endTime <= f.callTime), signUp: f.signUp, crewCallId: props.crewCallId ?? null }
      await write('/api/front-of-house/shifts', { method: 'POST', body })
    }
    toast.add({ title: t('front-of-house.grid.shifts-added', { count: props.cells.length }), color: 'success' })
    open.value = false
    emit('done')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const addForm = useFormRef('addForm')
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('front-of-house.grid.add-title', { count: cells.length })"
  >
    <template #body>
      <UForm
        id="fh-grid-add"
        ref="addForm"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ title: form.title, places: form.places, callTime: form.callTime, endTime: form.endTime })"
        novalidate
        @submit="add"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('front-of-house.grid.title')"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="places"
          :label="t('front-of-house.grid.places')"
          required
        >
          <FieldNumber
            v-model="form.places"
            :min="1"
            :max="50"
          />
        </UFormField>
        <FrontOfHouseGridTimes
          v-model:call="form.callTime"
          v-model:end="form.endTime"
        />
        <UCheckbox
          v-model="form.signUp"
          :label="t('front-of-house.grid.sign-up')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="fh-grid-add"
        :loading="addForm?.loading"
        :label="t('front-of-house.grid.add', { count: cells.length })"
      />
    </template>
  </UModal>
</template>
