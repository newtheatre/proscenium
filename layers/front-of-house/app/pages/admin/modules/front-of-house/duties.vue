<!-- Duties (Front of house specification, part 5, "Console"): the jobs people do on a night, such
     as Steward or Duty manager, with the time they are called before the performance and stay after.
     Adding and changing share one form; a duty in use is archived, never deleted. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Duty {
  id: string
  name: string
  description: string | null
  isLead: boolean
  callBeforeMinutes: number
  stayAfterMinutes: number
  requirements: string[]
  sortOrder: number
  archivedAt: number | null
}

const { t, te } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const undo = useUndo()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ duties: Duty[], archived?: Duty[], requirementOptions?: { value: string, label: string }[], requirementLabels?: Record<string, string> }>('/api/front-of-house/duties', { key: 'front-of-house:duties' })
// A fact's label arrives as its translation key.
const said = (label: string) => te(label) ? t(label) : label
const requirementItems = computed(() => (data.value?.requirementOptions ?? []).map(o => ({ value: o.value, label: said(o.label) })))
const requirementLabel = (ref: string) => said(data.value?.requirementLabels?.[ref] ?? ref)

const blank = () => ({ name: '', description: '', isLead: false, callBeforeMinutes: 60 as number | null, stayAfterMinutes: 30 as number | null, requirements: [] as string[] }) // not-policy: a new duty's starting values
const form = ref(blank())
const editing = ref<Duty | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const open = ref(false)

function edit(duty: Duty) {
  editing.value = duty
  form.value = { name: duty.name, description: duty.description ?? '', isLead: duty.isLead, callBeforeMinutes: duty.callBeforeMinutes, stayAfterMinutes: duty.stayAfterMinutes, requirements: [...duty.requirements] }
  refusal.value = null
  open.value = true
}
function add() {
  editing.value = null
  form.value = blank()
  refusal.value = null
  open.value = true
}

async function save() {
  refusal.value = null
  const body = { ...form.value, callBeforeMinutes: form.value.callBeforeMinutes ?? 0, stayAfterMinutes: form.value.stayAfterMinutes ?? 0, name: form.value.name.trim(), description: form.value.description.trim() || null }
  try {
    if (editing.value) await write(`/api/front-of-house/duties/${encodeURIComponent(editing.value.id)}`, { method: 'PUT', body })
    else await write('/api/front-of-house/duties', { method: 'POST', body })
    toast.add({ title: t(editing.value ? 'front-of-house.duties.saved' : 'front-of-house.duties.added', { name: body.name }), color: 'success' })
    open.value = false
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Archiving asks nothing first: it is undone from its own toast, or later from the archived list.
async function setArchived(duty: Duty, archived: boolean) {
  refusal.value = null
  const call = (to: boolean) => write(`/api/front-of-house/duties/${encodeURIComponent(duty.id)}/${to ? 'archive' : 'restore'}`, { method: 'POST', body: {} })
  try {
    await call(archived)
    undo.offer(t(archived ? 'front-of-house.duties.archived' : 'front-of-house.duties.restored', { name: duty.name }), async () => {
      await call(!archived)
      await refresh()
    })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const showArchived = ref(false)

const actions = (duty: Duty): DropdownMenuItem[][] => [
  [{ label: t('front-of-house.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(duty) }],
  [{ label: t('front-of-house.archive.button'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void setArchived(duty, true) } }],
]
const minutes = (n: number) => t('front-of-house.minutes', { count: n })
const fhDutyForm = useFormRef('fhDutyForm')
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.duties.label')"
    :description="t('front-of-house.duties.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('front-of-house.duties.add-button')"
        @click="add"
      />
    </template>
    <div class="space-y-4">
      <RefusalNotice
        v-if="!open"
        :refusal="refusal"
      />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <div class="space-y-4">
            <EmptyState
              v-if="!d.duties.length"
              :title="t('front-of-house.duties.empty.title')"
              :description="t('front-of-house.duties.empty.description')"
              icon="i-lucide-badge-check"
            />
            <RecordList
              v-else
              :label="t('front-of-house.navigation.duties.label')"
            >
              <RecordListItem
                v-for="duty in d.duties"
                :key="duty.id"
                :name="duty.name"
                :description="[duty.isLead ? t('front-of-house.duties.leads') : null, t('front-of-house.duties.times', { before: minutes(duty.callBeforeMinutes), after: minutes(duty.stayAfterMinutes) }), duty.requirements.length ? t('front-of-house.duties.only-for', { what: duty.requirements.map(requirementLabel).join(t('front-of-house.duties.and')) }) : null, duty.description].filter(Boolean).join(' · ')"
              >
                <RowActions
                  :items="actions(duty)"
                  :label="t('front-of-house.actions-for', { name: duty.name })"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('front-of-house.archived.label')"
              :count="d.archived?.length ?? 0"
            >
              <RecordList :label="t('front-of-house.duties.archived-list')">
                <RecordListItem
                  v-for="duty in d.archived"
                  :key="duty.id"
                  :name="duty.name"
                  :description="[duty.isLead ? t('front-of-house.duties.leads') : null, t('front-of-house.duties.times', { before: minutes(duty.callBeforeMinutes), after: minutes(duty.stayAfterMinutes) }), duty.requirements.length ? t('front-of-house.duties.only-for', { what: duty.requirements.map(requirementLabel).join(t('front-of-house.duties.and')) }) : null, duty.description].filter(Boolean).join(' · ')"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('front-of-house.restore.button')"
                    :aria-label="t('front-of-house.restore.named', { name: duty.name })"
                    loading-auto
                    @click="setArchived(duty, false)"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </template>
      </DataBoundary>
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? t('front-of-house.duties.edit-title', { name: editing.name }) : t('front-of-house.duties.add-title')"
    >
      <template #body>
        <UForm
          id="fh-duty"
          ref="fhDutyForm"
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('front-of-house.duties.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField :label="t('front-of-house.duties.about')">
            <UTextarea
              v-model="form.description"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('front-of-house.duties.call-before')"
              :help="t('front-of-house.duties.call-before-help')"
            >
              <MinutesInput
                v-model="form.callBeforeMinutes"
                :min="0"
                :max="480"
              />
            </UFormField>
            <UFormField
              :label="t('front-of-house.duties.stay-after')"
              :help="t('front-of-house.duties.stay-after-help')"
            >
              <MinutesInput
                v-model="form.stayAfterMinutes"
                :min="0"
                :max="480"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.isLead"
            :label="t('front-of-house.duties.is-lead')"
            :description="t('front-of-house.duties.is-lead-help')"
          />
          <UFormField
            v-if="requirementItems.length"
            name="requirements"
            :label="t('front-of-house.duties.requirements')"
            :help="t('front-of-house.duties.requirements-help')"
          >
            <USelectMenu
              v-model="form.requirements"
              :items="requirementItems"
              value-key="value"
              multiple
              :placeholder="t('front-of-house.duties.requirements-none')"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          :loading="fhDutyForm?.loading"
          form="fh-duty"
          :label="editing ? t('front-of-house.save') : t('front-of-house.duties.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
