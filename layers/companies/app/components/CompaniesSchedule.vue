<!-- An engagement's calls and people (CO-23, CO-24), for staff on the engagement's tab and for the
     company's contacts on Your engagement. What each may change comes from the server. -->
<script setup lang="ts">
import type { CallRow, PersonRow } from '../../shared/views'

const props = defineProps<{ engagementId: string, closed?: boolean }>()
const { t } = useT()
const dates = useDates()
const { offer } = useUndo()
const { data, status, error, refresh, refusal, warnings, removeCall, removePerson } = await useEngagementSchedule(() => props.engagementId)
const editingCall = ref<CallRow | null>(null)
const editingPerson = ref<PersonRow | null>(null)
const callDialog = ref(false)
const personDialog = ref(false)
const canCalls = computed(() => !!data.value?.canManageCalls && !props.closed)
const canPeople = computed(() => !!data.value?.canManagePeople && !props.closed)

const callName = (c: CallRow) => c.kind === 'other' && c.label ? c.label : t(`companies.calls.kinds.${c.kind}`)
const callWhen = (c: CallRow) => t('companies.calls.when', { from: dates.dateTime(c.startsAt), to: dates.time(c.endsAt) })
const callDescription = (c: CallRow) => [callWhen(c), c.space ?? t('companies.calls.no-space'), c.notes].filter(Boolean).join(' · ')

function editCall(c: CallRow | null) {
  editingCall.value = c
  callDialog.value = true
}
function editPerson(p: PersonRow | null) {
  editingPerson.value = p
  personDialog.value = true
}
function callSaved(message: string, said: string[]) {
  warnings.value = said
  void refresh()
  offer(message)
}
function personSaved(message: string) {
  void refresh()
  offer(message)
}
const callActions = (c: CallRow) => canCalls.value
  ? [
      [{ label: t('companies.calls.change-short'), icon: 'i-lucide-pencil', onSelect: () => editCall(c) }],
      [{ label: t('companies.schedule.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeCall(c, callName(c)) }],
    ]
  : []
const personActions = (p: PersonRow) => canPeople.value
  ? [
      [{ label: t('companies.people.change-short'), icon: 'i-lucide-pencil', onSelect: () => editPerson(p) }],
      [{ label: t('companies.schedule.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removePerson(p) }],
    ]
  : []
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <div
      v-if="data"
      class="space-y-6"
    >
      <RefusalNotice :refusal="refusal" />
      <UAlert
        v-for="w in warnings"
        :key="w"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="w"
        :close="true"
        @update:open="warnings = []"
      />
      <PageSection
        :title="t('companies.calls.title')"
        :description="t('companies.calls.description')"
      >
        <template
          v-if="canCalls"
          #actions
        >
          <UButton
            :label="t('companies.calls.add')"
            icon="i-lucide-calendar-plus"
            color="neutral"
            variant="outline"
            @click="editCall(null)"
          />
        </template>
        <EmptyState
          v-if="!data.calls.length"
          :title="t('companies.calls.empty')"
          :description="t('companies.calls.empty-description')"
          icon="i-lucide-calendar-clock"
        />
        <RecordList
          v-else
          :label="t('companies.calls.title')"
        >
          <RecordListItem
            v-for="c in data.calls"
            :key="c.id"
            :name="callName(c)"
            :description="callDescription(c)"
          >
            <RowActions
              v-if="canCalls"
              :items="callActions(c)"
              :label="t('companies.calls.actions', { name: callName(c) })"
            />
          </RecordListItem>
        </RecordList>
      </PageSection>
      <PageSection
        :title="t('companies.people.title')"
        :description="data.canManagePeople || !data.started ? t('companies.people.description') : t('companies.people.description-started')"
      >
        <template
          v-if="canPeople"
          #actions
        >
          <UButton
            :label="t('companies.people.add')"
            icon="i-lucide-user-plus"
            color="neutral"
            variant="outline"
            @click="editPerson(null)"
          />
        </template>
        <EmptyState
          v-if="!data.people.length"
          :title="t('companies.people.empty')"
          :description="t('companies.people.empty-description')"
          icon="i-lucide-users"
        />
        <RecordList
          v-else
          :label="t('companies.people.title')"
        >
          <RecordListItem
            v-for="p in data.people"
            :key="p.id"
            :name="p.name"
            :description="p.role ?? undefined"
          >
            <UBadge
              v-if="p.under18"
              :label="t('companies.people.under-18-badge')"
              color="warning"
              variant="subtle"
            />
            <RowActions
              v-if="canPeople"
              :items="personActions(p)"
              :label="t('companies.people.actions', { name: p.name })"
            />
          </RecordListItem>
        </RecordList>
      </PageSection>
      <CompaniesCallDialog
        v-model:open="callDialog"
        :engagement-id="engagementId"
        :call="editingCall"
        :spaces="data.spaces"
        @saved="callSaved"
      />
      <CompaniesPersonDialog
        v-model:open="personDialog"
        :engagement-id="engagementId"
        :person="editingPerson"
        @saved="personSaved"
      />
    </div>
  </DataBoundary>
</template>
