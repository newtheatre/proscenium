<!-- A grid shift's own actions (FH-48): copy it to other nights in view, or cancel it with a reason.
     The page opens one by setting `copying` or `cancelling`. -->
<script setup lang="ts">
import type { GridShift } from '../utils/rota-grid'

const props = defineProps<{ days: string[] }>()
const copying = defineModel<{ shift: GridShift, day: string } | null>('copying', { required: true })
const cancelling = defineModel<GridShift | null>('cancelling', { required: true })
const emit = defineEmits<{ done: [] }>()
const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()

const copyDays = ref<string[]>([])
const reason = ref('')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch([copying, cancelling], () => {
  refusal.value = null
  copyDays.value = []
  reason.value = ''
})
const otherDays = computed(() => props.days.filter(d => d !== copying.value?.day).map(d => ({ value: d, label: dates.dayBrief(d) })))
const path = (s: GridShift, action: string) => `/api/front-of-house/shifts/${encodeURIComponent(s.id)}/${action}`

async function copy() {
  if (!copying.value) return
  refusal.value = null
  try {
    const done = await write<{ shiftIds: string[] }>(path(copying.value.shift, 'copy'), { method: 'POST', body: { days: copyDays.value } })
    toast.add({ title: t('front-of-house.grid.copied', { count: done.shiftIds.length }), color: 'success' })
    copying.value = null
    emit('done')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function cancel() {
  if (!cancelling.value) return
  refusal.value = null
  try {
    await write(path(cancelling.value, 'cancel'), { method: 'POST', body: { reason: reason.value.trim() } })
    toast.add({ title: t('front-of-house.grid.cancelled'), color: 'success' })
    cancelling.value = null
    emit('done')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const copyForm = useFormRef('copyForm')
const cancelForm = useFormRef('cancelForm')
</script>

<template>
  <UModal
    :open="!!copying"
    :title="t('front-of-house.grid.copy-title')"
    @update:open="v => { if (!v) copying = null }"
  >
    <template #body>
      <UForm
        id="fh-grid-copy"
        ref="copyForm"
        class="space-y-4"
        :state="{ days: copyDays }"
        :validate="() => needs({ days: copyDays })"
        novalidate
        @submit="copy"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="days"
          :label="t('front-of-house.grid.copy-days')"
          :help="t('front-of-house.grid.copy-help')"
          required
        >
          <UCheckboxGroup
            v-model="copyDays"
            :items="otherDays"
            value-key="value"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="fh-grid-copy"
        :loading="copyForm?.loading"
        :label="t('front-of-house.grid.copy')"
      />
    </template>
  </UModal>

  <UModal
    :open="!!cancelling"
    :title="t('front-of-house.grid.cancel-title')"
    @update:open="v => { if (!v) cancelling = null }"
  >
    <template #body>
      <UForm
        id="fh-grid-cancel"
        ref="cancelForm"
        class="space-y-4"
        :state="{ reason }"
        :validate="() => needs({ reason })"
        novalidate
        @submit="cancel"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="reason"
          :label="t('front-of-house.grid.cancel-reason')"
          :help="t('front-of-house.grid.cancel-help')"
          required
        >
          <UInput
            v-model="reason"
            maxlength="200"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="fh-grid-cancel"
        color="error"
        :loading="cancelForm?.loading"
        :label="t('front-of-house.grid.cancel-shift')"
      />
    </template>
  </UModal>
</template>
