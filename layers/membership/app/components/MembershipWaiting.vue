<!-- Applications waiting on staff, above the members (tab 5, "Members"; V2, V3, AP2): who applied,
     for which scheme and what it waits for. A check is passed or declined here; approval is
     decided on the application form's response, which its row opens. Nothing is drawn when
     nothing waits. -->
<script setup lang="ts">
import { addDays } from '../../shared/dates'

interface Application { id: string, accountId: string, accountName: string | null, schemeId: string, schemeName: string, appliedAt: number, reason: string | null, reference: string | null, listName: string | null, claimedBy: { membershipId: string, name: string | null } | null, startsNow: boolean, endsOn: string | null, waitsFor: 'check' | 'approval', responseTo: string | null }

const emit = defineEmits<{ decided: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const { data, refresh } = await useAPI<{ today: string, applications: Application[] }>('/api/membership/applications', { key: 'membership:applications' })

const deciding = ref<{ application: Application, outcome: 'pass' | 'decline' } | null>(null)
const note = ref('')
// Passing an ID the list does not hold adds it to the list unless unticked.
const addToList = ref(true)
// Passing that starts the membership may end it on another day than its length gives.
const endsOn = ref('')
const tomorrow = computed(() => data.value ? addDays(data.value.today, 1) : undefined)
const settingEnd = computed(() => deciding.value?.outcome === 'pass' && deciding.value.application.startsNow)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function open(application: Application, outcome: 'pass' | 'decline') {
  deciding.value = { application, outcome }
  note.value = ''
  addToList.value = true
  endsOn.value = application.endsOn ?? ''
  refusal.value = null
}
async function decide() {
  const { application, outcome } = deciding.value!
  refusal.value = null
  try {
    await $api(`/api/membership/applications/${application.id}/decide` as string, { method: 'POST', body: { outcome, note: note.value.trim() || null, ...(outcome === 'pass' && application.reason === 'not-on-list' ? { addToList: addToList.value } : {}), ...(settingEnd.value && endsOn.value && endsOn.value !== application.endsOn ? { endsOn: endsOn.value } : {}) } })
    toast.add({ title: t(`membership.screens.applications.done-${outcome}`, { name: application.accountName ?? '' }), color: 'success' })
    deciding.value = null
    // The sidebar's count, the home card and the members below follow the decision.
    await Promise.all([refresh(), refreshNuxtData(['core:navigation:console', 'core:home:console'])])
    emit('decided')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
// Which scheme and when, then why it waits: the second line is what staff act on.
const describe = (a: Application) => [
  a.schemeName,
  t('membership.screens.applications.applied', { date: day(new Date(a.appliedAt).toISOString().slice(0, 10)) }), // not-policy: the length of a date
].join(' · ')
const waitsFor = (a: Application) => a.waitsFor === 'approval'
  ? t('membership.screens.applications.reasons.approval')
  : [
      t(`membership.screens.applications.reasons.${a.reason ?? 'staff-check'}`),
      ...(a.reason === 'not-on-list' && a.reference ? [t('membership.screens.applications.reference', { reference: a.reference })] : []),
      ...(a.listName ? [t('membership.screens.applications.list-name', { name: a.listName })] : []),
      ...(a.claimedBy ? [t('membership.screens.applications.claimed-by', { name: a.claimedBy.name ?? t('membership.screens.applications.no-name') })] : []),
    ].join(' · ')
// A long queue shows its oldest few; the rest fold away so the members stay in reach.
const FIRST = 5 // not-policy: how many rows show before the fold
const more = ref(false)
const shown = computed(() => more.value ? data.value?.applications ?? [] : (data.value?.applications ?? []).slice(0, FIRST))
const membershipDecideForm = useFormRef('membershipDecideForm')
</script>

<template>
  <PageSection
    v-if="data?.applications.length"
    id="waiting"
    :title="t('membership.screens.applications.title', { count: data.applications.length })"
    :description="t('membership.screens.applications.help')"
  >
    <RecordList :label="t('membership.screens.applications.title', { count: data.applications.length })">
      <RecordListItem
        v-for="a in shown"
        :key="a.id"
        :name="a.accountName ?? t('membership.screens.applications.no-name')"
      >
        <template #description>
          <span class="block">{{ describe(a) }}</span>
          <span class="block text-default">{{ waitsFor(a) }}</span>
        </template>
        <div
          v-if="a.waitsFor === 'check'"
          class="flex gap-2"
        >
          <UButton
            size="sm"
            :label="t('membership.screens.applications.pass')"
            @click="open(a, 'pass')"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :label="t('membership.screens.applications.decline')"
            @click="open(a, 'decline')"
          />
        </div>
        <UButton
          v-else-if="a.responseTo"
          size="sm"
          color="neutral"
          variant="outline"
          :to="a.responseTo"
          :label="t('membership.screens.applications.read')"
        />
      </RecordListItem>
    </RecordList>
    <UButton
      v-if="!more && data.applications.length > FIRST"
      color="neutral"
      variant="link"
      :label="t('membership.screens.applications.more', { count: data.applications.length })"
      @click="more = true"
    />
    <UModal
      :open="!!deciding"
      :title="deciding ? t(`membership.screens.applications.title-${deciding.outcome}`, { name: deciding.application.accountName ?? '', scheme: deciding.application.schemeName }) : ''"
      @update:open="v => { if (!v) deciding = null }"
    >
      <template #body>
        <UForm
          id="membership-decide"
          ref="membershipDecideForm"
          :state="{ note }"
          class="space-y-4"
          novalidate
          @submit="decide"
        >
          <RefusalNotice :refusal="refusal?.fields?.endsOn && settingEnd ? null : refusal" />
          <UAlert
            v-if="deciding?.outcome === 'pass' && deciding.application.claimedBy"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('membership.screens.applications.claimed-by', { name: deciding.application.claimedBy.name ?? t('membership.screens.applications.no-name') })"
            :description="t('membership.screens.applications.claimed-by-help')"
            :actions="[{ label: t('membership.screens.applications.claimed-by-open', { name: deciding.application.claimedBy.name ?? t('membership.screens.applications.no-name') }), to: `/console/membership/memberships/${deciding.application.claimedBy.membershipId}`, color: 'neutral', variant: 'outline', size: 'sm' }]"
          />
          <p class="text-sm text-muted">
            {{ deciding ? t(`membership.screens.applications.consequence-${deciding.outcome}`) : '' }}
          </p>
          <UCheckbox
            v-if="deciding?.outcome === 'pass' && deciding.application.reason === 'not-on-list' && deciding.application.reference"
            v-model="addToList"
            :label="t('membership.screens.applications.add-to-list', { reference: deciding.application.reference })"
            :description="t('membership.screens.applications.add-to-list-help')"
          />
          <UFormField
            v-if="settingEnd"
            name="endsOn"
            :label="t('membership.screens.applications.ends-on')"
            :help="t(deciding!.application.endsOn ? 'membership.screens.applications.ends-on-help' : 'membership.screens.applications.ends-on-help-none')"
            :error="refusal?.fields?.endsOn ? refusal.reason : undefined"
          >
            <FieldDate
              v-model="endsOn"
              :min="tomorrow"
            />
          </UFormField>
          <UFormField
            :label="t('membership.screens.applications.note')"
            :help="t('membership.screens.applications.note-help')"
          >
            <UTextarea
              v-model="note"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-decide"
          :loading="membershipDecideForm?.loading"
          :color="deciding?.outcome === 'decline' ? 'error' : 'primary'"
          :label="deciding ? t(`membership.screens.applications.${deciding.outcome}`) : ''"
        />
      </template>
    </UModal>
  </PageSection>
</template>
