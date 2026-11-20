<!-- One membership (tab 5, "A membership"): the person, scheme, number and status, its dates and how
     it started, every check made on it, ending it with a note, and correcting its dates (MEM-28).
     Where the fees module is on and the reader may see fees, its fee too, with waiving an unpaid one
     and asking for a refund of a paid one (P7, P9); the section is absent otherwise. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Detail {
  membership: { id: string, accountId: string, name: string, schemeId: string, schemeName: string, side: string, lengthRule: string, state: string, status: string, origin: string, lengthName: string | null, startsOn: string | null, endsOn: string | null, endedAt: number | null, endReason: string | null, note: string | null, createdAt: number, responseId: string | null, awaitingApproval: boolean }
  number: string | null
  canChangeDates: boolean
  canEditFields: boolean
  feesOn: boolean
  checks: { verifier: string, outcome: string, reason: string | null, note: string | null, decidedBy: string | null, createdAt: number, listName: string | null, listedAs: string | null, reference: string | null, noun: string | null }[]
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day, dateTime } = useDates()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Detail>(() => `/api/membership/memberships/${id.value}`, { key: `membership:membership:${id.value}` })
const m = computed(() => data.value?.membership)
const TONES: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = { 'current': 'success', 'in-grace': 'warning', 'upcoming': 'info', 'pending': 'info' }

const facts = computed(() => {
  const x = m.value
  if (!x) return []
  return [
    { label: t('membership.membership.holder'), value: x.name, to: `/console/people/${x.accountId}` },
    { label: t('membership.membership.scheme'), value: x.schemeName },
    { label: t('membership.membership.number'), value: data.value?.number ?? '' },
    { label: t('membership.membership.starts'), value: x.startsOn ? day(x.startsOn) : '' },
    { label: t('membership.membership.ends'), value: x.endsOn ? day(x.endsOn) : t('membership.members.no-end') },
    { label: t('membership.membership.origin'), value: t(`membership.membership.origins.${x.origin}`) },
    ...(x.lengthName ? [{ label: t('membership.membership.length'), value: x.lengthName }] : []),
    ...(x.endedAt ? [{ label: t('membership.membership.ended'), value: `${dateTime(x.endedAt)} (${t(`membership.membership.end-reasons.${x.endReason}`)})` }] : []),
  ]
})

// The application form's response, as forms names it, for those who may read responses (MEM-12).
const answers = ref<{ title: string, to: string | null } | null>(null)
watch(() => m.value?.responseId, async (responseId) => {
  answers.value = null
  if (!responseId) return
  const found = await $api<{ records: { title: string, to: string | null }[] }>('/api/core/records', { query: { type: 'forms.response', ids: responseId } }).catch(() => ({ records: [] }))
  answers.value = found.records[0] ?? null
}, { immediate: true })

// The custom fields' own request, shared by key, so a theatre that keeps none sees no empty section.
const { data: fieldSets } = await useAPI<{ sets: unknown[] }>(() => `/api/forms/records/membership.member-fields/${encodeURIComponent(id.value)}`, { key: `forms:record:membership.member-fields:${id.value}`, immediate: !!data.value?.canEditFields })

const ending = ref(false)
const note = ref('')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function end() {
  refusal.value = null
  try {
    await $api(`/api/membership/memberships/${id.value}/end` as string, { method: 'POST', body: { note: note.value } })
    ending.value = false
    toast.add({ title: t('membership.membership.ended-toast'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// The fee, from the fees module when it is on. Absent when it is off or the reader may not see fees.
interface Fee { charge: { id: string, state: 'open' | 'paid' | 'void' | 'refunded' | 'part-refunded', amountMinor: number, refundedMinor: number, currency: string, paidAt: number | null } | null, canWaive: boolean, canRefund: boolean }
const fee = await useAPI<Fee>(() => `/api/membership-fees/memberships/${id.value}/charge`, { key: `membership:fee:${id.value}`, default: () => ({ charge: null, canWaive: false, canRefund: false }), immediate: false })
// Not asked while Membership fees is off: there is nothing there to answer.
if (data.value?.feesOn) await fee.execute()
const charge = computed(() => fee.error.value ? null : fee.data.value?.charge ?? null)
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100) // not-policy: minor units to units
const feeLine = computed(() => {
  const c = charge.value
  if (!c) return ''
  const parts = [t(`membership.membership.fee-states.${c.state}`, { amount: money(c.amountMinor, c.currency) })]
  if (c.paidAt) parts.push(dateTime(c.paidAt))
  if (c.refundedMinor) parts.push(t('membership.membership.fee-refunded', { amount: money(c.refundedMinor, c.currency) }))
  return parts.join(' · ')
})
const waiving = ref(false)
const waiveNote = ref('')
const refunding = ref(false)
const refundMinor = ref<number | null>(null)
const feeRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function waive() {
  feeRefusal.value = null
  try {
    await $api(`/api/membership-fees/charges/${charge.value!.id}/waive` as string, { method: 'POST', body: { note: waiveNote.value } })
    waiving.value = false
    toast.add({ title: t('membership.membership.waived-toast'), color: 'success' })
    await Promise.all([refresh(), fee.refresh()])
  }
  catch (e) {
    feeRefusal.value = toRefusal(e)
  }
}
async function refund() {
  feeRefusal.value = null
  try {
    const asked = await $api<{ state: 'requested' | 'approved' }>(`/api/membership-fees/charges/${charge.value!.id}/refund` as string, { method: 'POST', body: { amountMinor: refundMinor.value } })
    refunding.value = false
    toast.add({ title: t(asked.state === 'approved' ? 'membership.membership.refund-approved' : 'membership.membership.refund-requested'), color: 'success' })
    await fee.refresh()
  }
  catch (e) {
    feeRefusal.value = toRefusal(e)
  }
}

const dating = ref(false)
const dates = reactive({ startsOn: '', endsOn: '', note: '' })
const datesRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const indefinite = computed(() => m.value?.lengthRule === 'indefinite')
function openDates() {
  dates.startsOn = m.value?.startsOn ?? ''
  dates.endsOn = m.value?.endsOn ?? ''
  dates.note = ''
  datesRefusal.value = null
  dating.value = true
}
async function saveDates() {
  datesRefusal.value = null
  try {
    await $api(`/api/membership/memberships/${id.value}/dates` as string, { method: 'POST', body: { startsOn: dates.startsOn, endsOn: dates.endsOn || null, note: dates.note } })
    dating.value = false
    toast.add({ title: t('membership.membership.dates-toast'), color: 'success' })
    await refresh()
  }
  catch (e) {
    datesRefusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="m?.name ?? t('membership.navigation.members.label')"
    :trail="[{ label: t('membership.navigation.members.label'), to: '/console/membership' }]"
  >
    <template
      v-if="m"
      #status
    >
      <StatusBadge
        :tone="TONES[m.status] ?? 'neutral'"
        :label="t(`membership.members.status.${m.status}`)"
      />
    </template>
    <template
      v-if="m && (m.state === 'active' || m.state === 'pending')"
      #primary
    >
      <UButton
        v-if="data?.canChangeDates"
        color="neutral"
        variant="outline"
        icon="i-lucide-calendar-cog"
        :label="t('membership.membership.change-dates')"
        @click="openDates()"
      />
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-circle-stop"
        :label="t('membership.membership.end')"
        @click="ending = true; note = ''; refusal = null"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && m"
        class="space-y-6"
      >
        <FactStrip :facts="facts" />
        <PageSection
          v-if="data.canEditFields && fieldSets?.sets.length"
          :title="t('membership.membership.fields')"
        >
          <FormsRecordFields
            slot-id="membership.member-fields"
            :subject="m.id"
          />
        </PageSection>
        <PageSection
          v-if="m.responseId"
          :title="t('membership.membership.application')"
          :description="m.awaitingApproval ? t('membership.membership.awaiting-approval') : undefined"
        >
          <UButton
            v-if="answers?.to"
            color="neutral"
            variant="link"
            class="px-0"
            icon="i-lucide-file-text"
            :to="answers.to"
            :label="t('membership.membership.open-answers', { title: answers.title })"
          />
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ t('membership.membership.answers-hidden') }}
          </p>
        </PageSection>
        <PageSection
          v-if="m.note"
          :title="t('membership.membership.note')"
        >
          <p class="whitespace-pre-line">
            {{ m.note }}
          </p>
        </PageSection>
        <PageSection
          v-if="charge"
          :title="t('membership.membership.fee')"
        >
          <template #actions>
            <UButton
              v-if="fee.data.value?.canWaive"
              color="neutral"
              variant="outline"
              :label="t('membership.membership.waive')"
              @click="waiving = true; waiveNote = ''; feeRefusal = null"
            />
            <UButton
              v-if="fee.data.value?.canRefund"
              color="neutral"
              variant="outline"
              :label="t('membership.membership.refund')"
              @click="refunding = true; refundMinor = charge.amountMinor - charge.refundedMinor; feeRefusal = null"
            />
          </template>
          <p>{{ feeLine }}</p>
        </PageSection>
        <PageSection :title="t('membership.membership.checks')">
          <p
            v-if="!data.checks.length"
            class="text-muted"
          >
            {{ t('membership.membership.no-checks') }}
          </p>
          <RecordList
            v-else
            :label="t('membership.membership.checks')"
          >
            <RecordListItem
              v-for="(c, i) in data.checks"
              :key="i"
              :name="t(`membership.membership.outcomes.${c.outcome}`)"
              :description="[dateTime(c.createdAt), t(`membership.screens.verifiers.${c.verifier}`), c.listName ? t('membership.membership.from-list', { list: c.listName }) : '', c.reference ? t('membership.membership.reference', { noun: c.noun ?? t('membership.membership.reference-noun'), reference: c.reference }) : '', c.listedAs ? t('membership.membership.listed-as', { name: c.listedAs }) : '', c.decidedBy ? t('membership.membership.by', { name: c.decidedBy }) : '', c.note ?? ''].filter(Boolean).join(' · ')"
            />
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="ending"
      :title="t('membership.membership.end-title', { name: m?.name ?? '' })"
    >
      <template #body>
        <UForm
          id="membership-end"
          :state="{ note }"
          :validate="() => needs({ note })"
          class="space-y-4"
          novalidate
          @submit="end"
        >
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ t('membership.membership.end-consequence') }}
          </p>
          <UFormField
            name="note"
            :label="t('membership.membership.end-note')"
            :help="t('membership.membership.end-note-help')"
            required
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
          form="membership-end"
          color="error"
          loading-auto
          :label="t('membership.membership.end')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="waiving"
      :title="t('membership.membership.waive-title', { name: m?.name ?? '' })"
    >
      <template #body>
        <UForm
          id="membership-waive"
          :state="{ waiveNote }"
          :validate="() => needs({ waiveNote })"
          class="space-y-4"
          novalidate
          @submit="waive"
        >
          <RefusalNotice :refusal="feeRefusal" />
          <p class="text-sm text-muted">
            {{ t('membership.membership.waive-consequence') }}
          </p>
          <UFormField
            name="waiveNote"
            :label="t('membership.membership.end-note')"
            :help="t('membership.membership.end-note-help')"
            required
          >
            <UTextarea
              v-model="waiveNote"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-waive"
          loading-auto
          :label="t('membership.membership.waive')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="refunding"
      :title="t('membership.membership.refund-title', { name: m?.name ?? '' })"
    >
      <template #body>
        <UForm
          id="membership-refund"
          :state="{ refundMinor }"
          :validate="() => needs({ refundMinor: refundMinor || null })"
          class="space-y-4"
          novalidate
          @submit="refund"
        >
          <RefusalNotice :refusal="feeRefusal" />
          <p class="text-sm text-muted">
            {{ t('membership.membership.refund-consequence') }}
          </p>
          <UFormField
            name="refundMinor"
            :label="t('membership.membership.refund-amount')"
            required
          >
            <FieldMoney
              v-model="refundMinor"
              :currency="charge?.currency"
              :min="1"
              :max="charge ? charge.amountMinor - charge.refundedMinor : undefined"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-refund"
          color="error"
          loading-auto
          :label="t('membership.membership.refund')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="dating"
      :title="t('membership.membership.dates-title', { name: m?.name ?? '' })"
    >
      <template #body>
        <UForm
          id="membership-dates"
          :state="dates"
          :validate="() => needs({ startsOn: dates.startsOn, endsOn: indefinite ? true : dates.endsOn, note: dates.note })"
          class="space-y-4"
          novalidate
          @submit="saveDates"
        >
          <RefusalNotice :refusal="datesRefusal" />
          <p class="text-sm text-muted">
            {{ t('membership.membership.dates-consequence') }}
          </p>
          <UFormField
            name="startsOn"
            :label="t('membership.membership.starts')"
            required
          >
            <FieldDate v-model="dates.startsOn" />
          </UFormField>
          <UFormField
            name="endsOn"
            :label="t('membership.membership.ends')"
            :help="indefinite ? t('membership.membership.dates-end-help') : undefined"
            :required="!indefinite"
          >
            <FieldDate
              v-model="dates.endsOn"
              :min="dates.startsOn || undefined"
            />
          </UFormField>
          <UFormField
            name="note"
            :label="t('membership.membership.end-note')"
            :help="t('membership.membership.end-note-help')"
            required
          >
            <UTextarea
              v-model="dates.note"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-dates"
          loading-auto
          :label="t('membership.membership.dates-save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
