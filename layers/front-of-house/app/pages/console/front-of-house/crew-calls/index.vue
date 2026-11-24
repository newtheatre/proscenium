<!-- Crew calls (festival-ready changes, part 5, "Crew calls"): each invitation to crew a period,
     with its dates, state and how many shifts and crew it has. New opens a short form; the rest of a
     call is set up on its own page. Archived calls sit below the divider. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Call {
  id: string
  name: string
  seasonName: string | null
  startsOn: string
  endsOn: string
  state: 'draft' | 'open' | 'closed' | 'archived'
  shifts: number
  crew: number
  questions: boolean
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()
const { data, status, error, refresh } = await useAPI<{ calls: Call[], archived: Call[] }>('/api/front-of-house/crew-calls', { key: 'front-of-house:crew-calls' })
const { data: choices } = await useAPI<{ seasons: { id: string, name: string }[] }>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

const NONE = 'none'
const seasonItems = computed(() => [{ value: NONE, label: t('front-of-house.crew-calls.no-season') }, ...(choices.value?.seasons ?? []).map(s => ({ value: s.id, label: s.name }))])
const TONE = { draft: 'neutral', open: 'success', closed: 'warning', archived: 'neutral' } as const

const blank = () => ({ name: '', seasonId: NONE, days: { start: '', end: '' } })
const form = ref(blank())
const open = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function add() {
  form.value = blank()
  refusal.value = null
  open.value = true
}
async function save() {
  refusal.value = null
  const body = { name: form.value.name.trim(), seasonId: form.value.seasonId === NONE ? null : form.value.seasonId, startsOn: form.value.days.start, endsOn: form.value.days.end || form.value.days.start }
  try {
    const made = await write<{ crewCallId: string }>('/api/front-of-house/crew-calls', { method: 'POST', body })
    toast.add({ title: t('front-of-house.crew-calls.added', { name: body.name }), color: 'success' })
    open.value = false
    await navigateTo(`/console/front-of-house/crew-calls/${encodeURIComponent(made.crewCallId)}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const describe = (c: Call) => [
  dates.range(c.startsOn, c.endsOn),
  c.seasonName,
  t('front-of-house.crew-calls.shifts-count', { count: c.shifts }),
  t('front-of-house.crew-calls.crew-count', { count: c.crew }),
  c.questions ? null : t('front-of-house.crew-calls.no-questions'),
].filter(Boolean).join(' · ')
const actions = (c: Call): DropdownMenuItem[][] => [[{ label: t('front-of-house.crew-calls.open-call'), icon: 'i-lucide-arrow-right', to: `/console/front-of-house/crew-calls/${encodeURIComponent(c.id)}` }]]
const showArchived = ref(false)
const crewCallForm = useFormRef('crewCallForm')
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.crew-calls.label')"
    :description="t('front-of-house.crew-calls.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('front-of-house.crew-calls.add-button')"
        @click="add"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-4">
          <EmptyState
            v-if="!d.calls.length"
            :title="t('front-of-house.crew-calls.empty.title')"
            :description="t('front-of-house.crew-calls.empty.description')"
            icon="i-lucide-users-round"
          />
          <RecordList
            v-else
            :label="t('front-of-house.navigation.crew-calls.label')"
          >
            <RecordListItem
              v-for="c in d.calls"
              :key="c.id"
              :to="`/console/front-of-house/crew-calls/${encodeURIComponent(c.id)}`"
              :name="c.name"
              :description="describe(c)"
            >
              <StatusBadge
                :tone="TONE[c.state]"
                :label="t(`front-of-house.crew-call-states.${c.state}`)"
              />
              <RowActions
                :items="actions(c)"
                :label="t('front-of-house.actions-for', { name: c.name })"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            v-model:open="showArchived"
            :label="t('front-of-house.archived.label')"
            :count="d.archived.length"
          >
            <RecordList :label="t('front-of-house.crew-calls.archived-list')">
              <RecordListItem
                v-for="c in d.archived"
                :key="c.id"
                :to="`/console/front-of-house/crew-calls/${encodeURIComponent(c.id)}`"
                :name="c.name"
                :description="describe(c)"
                muted
              />
            </RecordList>
          </CollapsibleDivider>
        </div>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="t('front-of-house.crew-calls.add-title')"
    >
      <template #body>
        <UForm
          id="fh-crew-call"
          ref="crewCallForm"
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name, days: form.days.start })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('front-of-house.crew-calls.name')"
            :help="t('front-of-house.crew-calls.name-help')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            name="days"
            :label="t('front-of-house.crew-calls.days')"
            required
          >
            <FieldDateRange v-model="form.days" />
          </UFormField>
          <UFormField
            :label="t('front-of-house.crew-calls.season')"
            :help="t('front-of-house.crew-calls.season-help')"
          >
            <USelectMenu
              v-model="form.seasonId"
              :items="seasonItems"
              value-key="value"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-crew-call"
          :loading="crewCallForm?.loading"
          :label="t('front-of-house.crew-calls.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
