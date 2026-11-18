<!-- One award: who holds it, when and what for, the citation and the committee's decision.
     Correcting changes its wording, date and where it is listed; revoking takes it back with a
     reason, which leaves the roll and stops its ticket price. -->
<script setup lang="ts">
interface Award { id: string, typeId: string, typeName: string, accountId: string | null, recipientName: string, awardedOn: string, awardedFor: string | null, citation: string | null, productionId: string | null, productionTitle: string | null, decidedOn: string | null, decisionNote: string | null, source: string, visibility: 'public' | 'members' | 'hidden', state: 'current' | 'revoked', revokedAt: number | null, revokeReason: string | null }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { day, dateTime } = useDates()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ award: Award, canUpdate: boolean, canRevoke: boolean }>(() => `/api/awards/awards/${id.value}`, { key: `awards:award:${id.value}` })
const a = computed(() => data.value?.award)

const facts = computed(() => {
  const x = a.value
  if (!x) return []
  return [
    { label: t('awards.screens.award.type'), value: x.typeName },
    { label: t('awards.screens.award.awarded-on'), value: day(x.awardedOn) },
    ...(x.awardedFor ? [{ label: t('awards.screens.award.awarded-for'), value: x.awardedFor }] : []),
    ...(x.productionTitle ? [{ label: t('awards.screens.award.production'), value: x.productionTitle }] : []),
    { label: t('awards.screens.award.listed'), value: x.state === 'revoked' ? t('awards.screens.award.listed-revoked') : t(`awards.screens.visibility.${x.visibility}`) },
    { label: t('awards.screens.award.source'), value: t(`awards.screens.sources.${x.source}`) },
  ]
})
const decision = computed(() => [a.value?.decidedOn ? day(a.value.decidedOn) : null, a.value?.decisionNote].filter(Boolean).join(' · '))

const editing = ref(false)
const form = reactive({ recipientName: '', awardedOn: '', awardedFor: '', citation: '', productionId: null as string | null, decidedOn: '', decisionNote: '', visibility: 'public' as Award['visibility'] })
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const visibilities = computed(() => (['public', 'members', 'hidden'] as const).map(v => ({ value: v, label: t(`awards.screens.visibility.${v}`) })))
function openEdit() {
  const x = a.value!
  Object.assign(form, { recipientName: x.recipientName, awardedOn: x.awardedOn, awardedFor: x.awardedFor ?? '', citation: x.citation ?? '', productionId: x.productionId, decidedOn: x.decidedOn ?? '', decisionNote: x.decisionNote ?? '', visibility: x.visibility })
  refusal.value = null
  editing.value = true
}
async function save() {
  refusal.value = null
  try {
    await $api(`/api/awards/awards/${id.value}` as string, { method: 'PATCH', body: { recipientName: form.recipientName.trim(), awardedOn: form.awardedOn, awardedFor: form.awardedFor.trim() || null, citation: form.citation.trim() || null, productionId: form.productionId, decidedOn: form.decidedOn || null, decisionNote: form.decisionNote.trim() || null, visibility: form.visibility } })
    editing.value = false
    toast.add({ title: t('awards.screens.award.saved'), color: 'success' })
    await Promise.all([refresh(), refreshNuxtData('awards:list')])
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}

// An award recorded by name alone can be given its account later.
const linking = ref(false)
const link = reactive({ how: 'person' as 'person' | 'address', accountId: undefined as string | undefined, address: '' })
const linkEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('linkEl')
const linkRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
let linkKey = ''
const linkHow = computed(() => (['person', 'address'] as const).map(v => ({ value: v, label: t(`awards.screens.link.how-${v}`) })))
function openLink() {
  Object.assign(link, { how: 'person', accountId: undefined, address: '' })
  linkRefusal.value = null
  linkKey = crypto.randomUUID()
  linking.value = true
}
async function saveLink() {
  linkRefusal.value = null
  try {
    await $api(`/api/awards/awards/${id.value}/link` as string, { method: 'POST', headers: { 'idempotency-key': linkKey }, body: link.how === 'person' ? { accountId: link.accountId } : { address: link.address.trim() } })
    linking.value = false
    toast.add({ title: t('awards.screens.link.linked-toast'), color: 'success' })
    await Promise.all([refresh(), refreshNuxtData('awards:list')])
  }
  catch (e) {
    linkRefusal.value = toRefusal(e)
    linkEl.value?.setErrors(fieldErrors(linkRefusal.value))
  }
}

const revoking = ref(false)
const reason = ref('')
const revokeEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('revokeEl')
const revokeRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function revoke() {
  revokeRefusal.value = null
  try {
    await $api(`/api/awards/awards/${id.value}/revoke` as string, { method: 'POST', body: { reason: reason.value.trim() } })
    revoking.value = false
    toast.add({ title: t('awards.screens.award.revoked-toast'), color: 'success' })
    await Promise.all([refresh(), refreshNuxtData(['awards:list', 'awards:types'])])
  }
  catch (e) {
    revokeRefusal.value = toRefusal(e)
    revokeEl.value?.setErrors(fieldErrors(revokeRefusal.value))
  }
}
</script>

<template>
  <PageFrame
    :title="a?.recipientName ?? t('awards.navigation.awards.label')"
    :trail="[{ label: t('awards.navigation.awards.label'), to: '/console/awards' }]"
  >
    <template
      v-if="a"
      #status
    >
      <StatusBadge
        :tone="a.state === 'current' ? 'success' : 'neutral'"
        :label="t(`awards.screens.award-states.${a.state}`)"
      />
    </template>
    <template
      v-if="a"
      #primary
    >
      <UButton
        v-if="data?.canUpdate && a.state === 'current'"
        color="neutral"
        variant="outline"
        icon="i-lucide-pencil"
        :label="t('awards.screens.award.correct')"
        @click="openEdit()"
      />
      <UButton
        v-if="data?.canRevoke && a.state === 'current'"
        color="neutral"
        variant="outline"
        icon="i-lucide-undo-2"
        :label="t('awards.screens.award.revoke')"
        @click="revoking = true; reason = ''; revokeRefusal = null"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && a"
        class="space-y-6"
      >
        <UAlert
          v-if="a.state === 'revoked'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-undo-2"
          :title="t('awards.screens.award.revoked-on', { when: a.revokedAt ? dateTime(a.revokedAt) : '' })"
          :description="a.revokeReason ?? undefined"
        />
        <UAlert
          v-else-if="!a.accountId"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          :title="t('awards.screens.award.not-linked')"
          :description="t('awards.screens.award.not-linked-help')"
          :actions="data.canUpdate ? [{ label: t('awards.screens.link.title'), color: 'neutral', variant: 'outline', onClick: openLink }] : undefined"
        />
        <FactStrip :facts="facts" />
        <PageSection
          v-if="a.accountId"
          :title="t('awards.screens.award.holder')"
        >
          <UButton
            color="neutral"
            variant="link"
            class="px-0"
            icon="i-lucide-user"
            :to="`/console/people/${a.accountId}`"
            :label="t('awards.screens.award.open-person')"
          />
        </PageSection>
        <PageSection :title="t('awards.screens.award.citation')">
          <p
            v-if="a.citation"
            class="whitespace-pre-line"
          >
            {{ a.citation }}
          </p>
          <p
            v-else
            class="text-muted"
          >
            {{ t('awards.screens.award.no-citation') }}
          </p>
        </PageSection>
        <PageSection :title="t('awards.screens.award.decision')">
          <p :class="decision ? '' : 'text-muted'">
            {{ decision || t('awards.screens.award.no-decision') }}
          </p>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="t('awards.screens.award.correct')"
    >
      <template #body>
        <UForm
          id="awards-correct"
          ref="formEl"
          :state="form"
          :validate="() => needs({ recipientName: form.recipientName, awardedOn: form.awardedOn })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="recipientName"
            :label="t('awards.screens.issue.name')"
            :help="t('awards.screens.issue.name-help')"
            required
          >
            <UInput
              v-model="form.recipientName"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="awardedOn"
            :label="t('awards.screens.award.awarded-on')"
            required
          >
            <FieldDate v-model="form.awardedOn" />
          </UFormField>
          <UFormField
            name="awardedFor"
            :label="t('awards.screens.award.awarded-for')"
            :help="t('awards.screens.award.awarded-for-help')"
          >
            <UInput
              v-model="form.awardedFor"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            name="citation"
            :label="t('awards.screens.award.citation')"
          >
            <UTextarea
              v-model="form.citation"
              :rows="3"
              maxlength="2000"
            />
          </UFormField>
          <AwardsDecisionFields
            v-model:production-id="form.productionId"
            v-model:decided-on="form.decidedOn"
            v-model:decision-note="form.decisionNote"
          />
          <UFormField
            name="visibility"
            :label="t('awards.screens.award.listed')"
            :help="t('awards.screens.award.listed-help')"
          >
            <USelect
              v-model="form.visibility"
              :items="visibilities"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="awards-correct"
          loading-auto
          :label="t('awards.screens.award.save')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="linking"
      :title="t('awards.screens.link.title')"
      :description="t('awards.screens.link.help')"
    >
      <template #body>
        <UForm
          id="awards-link"
          ref="linkEl"
          :state="link"
          :validate="() => needs(link.how === 'person' ? { accountId: link.accountId } : { address: link.address })"
          class="space-y-4"
          novalidate
          @submit="saveLink"
        >
          <RefusalNotice :refusal="linkRefusal" />
          <UFormField
            name="how"
            :label="t('awards.screens.issue.who')"
          >
            <URadioGroup
              v-model="link.how"
              :items="linkHow"
            />
          </UFormField>
          <UFormField
            v-if="link.how === 'person'"
            name="accountId"
            :label="t('awards.screens.issue.person')"
            required
          >
            <PersonPicker v-model="link.accountId" />
          </UFormField>
          <UFormField
            v-else
            name="address"
            :label="t('awards.screens.issue.address')"
            :help="t('awards.screens.issue.address-help')"
            required
          >
            <UInput
              v-model="link.address"
              type="email"
              maxlength="254"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="awards-link"
          loading-auto
          :label="t('awards.screens.link.submit')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="revoking"
      :title="t('awards.screens.award.revoke-title', { name: a?.recipientName ?? '', award: a?.typeName ?? '' })"
      :description="t('awards.screens.award.revoke-help')"
    >
      <template #body>
        <UForm
          id="awards-revoke"
          ref="revokeEl"
          :state="{ reason }"
          :validate="() => needs({ reason })"
          class="space-y-4"
          novalidate
          @submit="revoke"
        >
          <RefusalNotice :refusal="revokeRefusal" />
          <UFormField
            name="reason"
            :label="t('awards.screens.award.revoke-reason')"
            required
          >
            <UTextarea
              v-model="reason"
              :rows="3"
              maxlength="500"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="awards-revoke"
          color="error"
          loading-auto
          :label="t('awards.screens.award.revoke')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
