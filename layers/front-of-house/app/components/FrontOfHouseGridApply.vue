<!-- Apply a rota template to the picked cells (FH-48): one batch for each venue picked, on the
     nights picked in it, all drafts. -->
<script setup lang="ts">
import { GRID_ANY, type GridCell, type GridChoices } from '../utils/rota-grid'

const props = defineProps<{ picked: GridCell[], choices: GridChoices | null | undefined, crewCall: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ done: [] }>()
const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data: templates } = await useAPI<{ templates: { id: string, name: string }[] }>('/api/front-of-house/rota-templates', { key: 'front-of-house:rota-templates', default: () => ({ templates: [] }) })

const form = ref({ templateId: '', title: '', callTime: '18:00', endTime: '23:00', crewCallId: GRID_ANY, spaceId: GRID_ANY, signUp: true })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (v) => {
  if (!v) return
  refusal.value = null
  form.value = { ...form.value, crewCallId: props.crewCall, spaceId: GRID_ANY }
})

const venues = computed(() => [...new Set(props.picked.map(p => p.venueId))])
const venueNames = computed(() => venues.value.map(id => props.choices?.venues.find(v => v.id === id)?.name ?? '').join(', '))
const none = (key: string) => ({ value: GRID_ANY, label: t(key) })
const templateItems = computed(() => (templates.value?.templates ?? []).map(x => ({ value: x.id, label: x.name })))
const spaceItems = computed(() => [none('front-of-house.grid.no-space'), ...(props.choices?.spaces ?? []).filter(s => s.venueId === venues.value[0]).map(s => ({ value: s.id, label: s.name }))])
const callItems = computed(() => [none('front-of-house.grid.no-call'), ...(props.choices?.crewCalls ?? []).map(c => ({ value: c.id, label: c.name }))])
const chosen = (v: string) => v === GRID_ANY ? null : v

async function apply() {
  refusal.value = null
  const f = form.value
  try {
    let made = 0
    for (const venueId of venues.value) {
      const days = [...new Set(props.picked.filter(p => p.venueId === venueId).map(p => p.day))]
      const body = { templateId: f.templateId, venueId, spaceId: venues.value.length === 1 ? chosen(f.spaceId) : null, title: f.title.trim(), days, callTime: f.callTime, endTime: f.endTime, crewCallId: chosen(f.crewCallId), signUp: f.signUp }
      made += (await write<{ batchId: string, shiftIds: string[] }>('/api/front-of-house/batches', { method: 'POST', body })).shiftIds.length
    }
    toast.add({ title: t('front-of-house.grid.batch-made', { count: made }), color: 'success' })
    open.value = false
    emit('done')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const applyForm = useFormRef('applyForm')
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('front-of-house.grid.apply-title')"
    :description="t('front-of-house.grid.apply-description', { count: picked.length, venues: venueNames })"
  >
    <template #body>
      <UForm
        id="fh-grid-apply"
        ref="applyForm"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ templateId: form.templateId, title: form.title, callTime: form.callTime, endTime: form.endTime })"
        novalidate
        @submit="apply"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="templateId"
          :label="t('front-of-house.rota.template')"
          required
        >
          <USelectMenu
            v-model="form.templateId"
            :items="templateItems"
            value-key="value"
            :placeholder="t('front-of-house.rota.choose-template')"
          />
        </UFormField>
        <UFormField
          name="title"
          :label="t('front-of-house.grid.title')"
          :help="t('front-of-house.grid.title-help')"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="80"
          />
        </UFormField>
        <FrontOfHouseGridTimes
          v-model:call="form.callTime"
          v-model:end="form.endTime"
        />
        <UFormField
          v-if="venues.length === 1"
          :label="t('front-of-house.grid.space')"
        >
          <USelectMenu
            v-model="form.spaceId"
            :items="spaceItems"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('front-of-house.grid.crew-call')">
          <USelectMenu
            v-model="form.crewCallId"
            :items="callItems"
            value-key="value"
          />
        </UFormField>
        <UCheckbox
          v-model="form.signUp"
          :label="t('front-of-house.grid.sign-up')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="fh-grid-apply"
        :loading="applyForm?.loading"
        :label="t('front-of-house.grid.apply')"
      />
    </template>
  </UModal>
</template>
