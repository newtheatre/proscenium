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

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ duties: Duty[] }>('/api/front-of-house/duties', { key: 'front-of-house:duties' })

const blank = () => ({ name: '', description: '', isLead: false, callBeforeMinutes: 60 as number | null, stayAfterMinutes: 30 as number | null }) // not-policy: a new duty's starting values
const form = ref(blank())
const editing = ref<Duty | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

function edit(duty: Duty) {
  editing.value = duty
  form.value = { name: duty.name, description: duty.description ?? '', isLead: duty.isLead, callBeforeMinutes: duty.callBeforeMinutes, stayAfterMinutes: duty.stayAfterMinutes }
}
function stop() {
  editing.value = null
  form.value = blank()
}

async function save() {
  refusal.value = null
  const body = { ...form.value, callBeforeMinutes: form.value.callBeforeMinutes ?? 0, stayAfterMinutes: form.value.stayAfterMinutes ?? 0, name: form.value.name.trim(), description: form.value.description.trim() || null, ...(editing.value ? { requirements: editing.value.requirements } : {}) }
  try {
    if (editing.value) await write(`/api/front-of-house/duties/${encodeURIComponent(editing.value.id)}`, { method: 'PUT', body })
    else await write('/api/front-of-house/duties', { method: 'POST', body })
    toast.add({ title: t(editing.value ? 'front-of-house.duties.saved' : 'front-of-house.duties.added', { name: body.name }), color: 'success' })
    stop()
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function archive(duty: Duty) {
  if (!await confirm({ verb: t('front-of-house.archive.verb'), thing: t('front-of-house.duties.thing', { name: duty.name }), consequence: t('front-of-house.duties.archive-consequence'), button: t('front-of-house.archive.button') })) return
  refusal.value = null
  try {
    await write(`/api/front-of-house/duties/${encodeURIComponent(duty.id)}/archive`, { method: 'POST', body: {} })
    toast.add({ title: t('front-of-house.duties.archived', { name: duty.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const actions = (duty: Duty): DropdownMenuItem[][] => [
  [{ label: t('front-of-house.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(duty) }],
  [{ label: t('front-of-house.archive.button'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void archive(duty) } }],
]
const minutes = (n: number) => t('front-of-house.minutes', { count: n })
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.duties.label')"
    :description="t('front-of-house.duties.description')"
  >
    <div class="space-y-8">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
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
              :description="[duty.isLead ? t('front-of-house.duties.leads') : null, t('front-of-house.duties.times', { before: minutes(duty.callBeforeMinutes), after: minutes(duty.stayAfterMinutes) }), duty.description].filter(Boolean).join(' · ')"
            >
              <RowActions
                :items="actions(duty)"
                :label="t('front-of-house.actions-for', { name: duty.name })"
              />
            </RecordListItem>
          </RecordList>
        </template>
      </DataBoundary>

      <PageSection :title="editing ? t('front-of-house.duties.edit-title', { name: editing.name }) : t('front-of-house.duties.add-title')">
        <UForm
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="save"
        >
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
          <div class="flex gap-2">
            <UButton
              type="submit"
              :label="editing ? t('front-of-house.save') : t('front-of-house.duties.add-button')"
            />
            <UButton
              v-if="editing"
              color="neutral"
              variant="ghost"
              :label="t('front-of-house.cancel')"
              @click="stop"
            />
          </div>
        </UForm>
      </PageSection>
    </div>
  </PageFrame>
</template>
