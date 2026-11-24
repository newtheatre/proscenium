<!-- An engagement's Agreement tab (part 5): every version newest first, with its state and who
     answered. A draft is sent or discarded; a sent version is withdrawn or its paper answer recorded;
     new terms start from the latest version (A1). -->
<script setup lang="ts">
import type { AgreementVersion } from '../../shared/views'

const props = defineProps<{ engagementId: string, currency: string, closed: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const dates = useDates()
const { deal, extras, stateBadge } = useAgreementWords()
interface Answer { versions: AgreementVersion[], canManage: boolean, canRecord: boolean, contacts: { accountId: string, name: string }[] }
const { data, refresh } = await useAPI<Answer>(() => `/api/companies/engagements/${props.engagementId}/agreements`, { key: `companies:agreements:${props.engagementId}` })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const editing = ref(false)
const recording = ref<AgreementVersion | null>(null)
const recordOpen = ref(false)
const manage = computed(() => !!data.value?.canManage && !props.closed)

async function act(v: AgreementVersion, verb: 'send' | 'withdraw', done: string) {
  refusal.value = null
  try {
    await $api(`/api/companies/engagements/${props.engagementId}/agreements/${v.id}/${verb}` as string, { method: 'POST', body: {} })
    await refresh()
    emit('changed')
    offer(done)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function changed(message: string) {
  await refresh()
  emit('changed')
  offer(message)
}
function record(v: AgreementVersion) {
  recording.value = v
  recordOpen.value = true
}
const describe = (v: AgreementVersion) => [deal(v, props.currency), extras(v, props.currency)].filter(Boolean).join(' · ')
const answered = (v: AgreementVersion) => v.answer && v.answeredAt
  ? t(v.onPaper ? 'companies.agreements.answered-paper' : 'companies.agreements.answered', { answer: t(`companies.agreements.states.${v.answer}`), who: v.responder ?? '', when: dates.dateTime(v.answeredAt) })
  : v.sentAt ? t('companies.agreements.sent-at', { when: dates.dateTime(v.sentAt) }) : null
const send = (v: AgreementVersion) => act(v, 'send', t('companies.agreements.sent', { version: v.version }))
const discard = (v: AgreementVersion) => act(v, 'withdraw', t('companies.agreements.discarded'))
const withdraw = (v: AgreementVersion) => act(v, 'withdraw', t('companies.agreements.withdrawn'))
function actions(v: AgreementVersion) {
  if (!manage.value) return []
  if (v.state === 'draft') {
    return [
      [{ label: t('companies.agreements.send'), icon: 'i-lucide-send', onSelect: () => { void send(v) } }],
      [{ label: t('companies.agreements.discard'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void discard(v) } }],
    ]
  }
  if (v.state !== 'sent') return []
  return [
    data.value?.canRecord ? [{ label: t('companies.agreements.record-button'), icon: 'i-lucide-file-signature', onSelect: () => record(v) }] : [],
    [{ label: t('companies.agreements.withdraw'), icon: 'i-lucide-undo-2', color: 'error' as const, onSelect: () => { void withdraw(v) } }],
  ]
}
</script>

<template>
  <PageSection
    :title="t('companies.tabs.agreement')"
    :description="t('companies.agreements.description')"
  >
    <template
      v-if="manage"
      #actions
    >
      <UButton
        :label="data?.versions.length ? t('companies.agreements.change-terms') : t('companies.agreements.new')"
        icon="i-lucide-file-pen"
        color="neutral"
        variant="outline"
        @click="editing = true"
      />
    </template>
    <div class="space-y-4">
      <RefusalNotice :refusal="refusal" />
      <EmptyState
        v-if="!data?.versions.length"
        :title="t('companies.agreements.empty')"
        :description="t('companies.agreements.empty-description')"
        icon="i-lucide-file-text"
      />
      <RecordList
        v-else
        :label="t('companies.tabs.agreement')"
      >
        <RecordListItem
          v-for="v in data.versions"
          :key="v.id"
          :name="t('companies.agreements.version', { version: v.version, deal: t(`companies.agreements.deal.${v.dealType}`) })"
          :description="describe(v)"
          :muted="['superseded', 'withdrawn'].includes(v.state)"
        >
          <template
            v-if="answered(v)"
            #below
          >
            <p class="text-sm text-muted">
              {{ answered(v) }}
            </p>
          </template>
          <StatusBadge v-bind="stateBadge(v)" />
          <RowActions
            :items="actions(v)"
            :label="t('companies.agreements.actions', { version: v.version })"
          />
        </RecordListItem>
      </RecordList>
    </div>
    <CompaniesAgreementEditor
      v-model:open="editing"
      :engagement-id="engagementId"
      :currency="currency"
      :from="data?.versions[0] ?? null"
      @saved="changed(t('companies.agreements.drafted'))"
    />
    <CompaniesRecordAnswerDialog
      v-if="recording"
      v-model:open="recordOpen"
      :agreement-id="recording.id"
      :version="recording.version"
      :contacts="data?.contacts ?? []"
      @recorded="changed(t('companies.agreements.recorded'))"
    />
  </PageSection>
</template>
