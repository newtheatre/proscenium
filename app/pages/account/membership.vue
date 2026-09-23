<script setup lang="ts">
import { saysDayLong } from '#shared/utils/when'
import { MEMBERSHIP_TERMS, londonDay, saysMembershipState } from '#shared/utils/membership'
import { saysMembershipSentence } from '#shared/utils/my-summary'
import type { MembershipState } from '#shared/utils/membership'
import { membershipClaimForm } from '#shared/utils/membership-claims'
import type { MembershipClaimInput } from '#shared/utils/membership-claims'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { PolicyValues } from '#shared/utils/policy-tokens'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/getting-started/your-account' })

interface OwnClaim {
  id: string
  studentId: string
  startsOn: string
  term: number
  status: string
  reason: string | null
  decidedAt: number | null
  createdAt: number
}

interface Own {
  membership: { startsOn: string, expiresOn: string } | null
  state: MembershipState
  graceDays: number
  claim: OwnClaim | null
}

const request = useRequestFetch()
const toast = useToast()
const today = londonDay(new Date())

// A bare $fetch here carries no session cookie on a full page load, so a real membership or an
// open claim read back as the empty default and never refetched (issue 1005, A-117, A-130).
const { data, refresh, error } = await useAsyncData<Own>(
  'account-membership',
  () => request<Own>('/api/account/membership'),
  { default: (): Own => ({ membership: null, state: { kind: 'none' }, graceDays: 0, claim: null }) },
)
const listFailure = useListFailure(error, 'Your membership could not be read.')

const sayDay = (day: string): string => saysDayLong(day, { year: true })

// Colour alone never carries the state: the badge word beside it is what says which (K-101).
const BADGE_COLOUR: Record<MembershipState['kind'], 'success' | 'warning' | 'neutral'> = {
  current: 'success',
  grace: 'warning',
  lapsed: 'neutral',
  none: 'neutral',
}

// Word and sentence both from the shared helpers: this page, the /my tile and every refusal
// say the state one way (K-128).
const standing = computed(() => {
  const state = data.value.state
  const until = 'until' in state ? state.until : null
  return { word: saysMembershipState(state.kind), says: saysMembershipSentence({ state: state.kind, until, claim: null }) }
})

const termLabel = (years: number): string => `${years} year${years === 1 ? '' : 's'}`

// The form starts from today because most people claim on the day they bought it.
const claim = reactive<Partial<MembershipClaimInput>>({ studentId: '', startsOn: today, term: 1 })
const claimForm = useTemplateRef('claimForm')
const submitting = ref(false)
const withdrawing = ref(false)
const failure = ref<string | null>(null)

async function submit(event: FormSubmitEvent<MembershipClaimInput>): Promise<void> {
  submitting.value = true
  failure.value = null
  try {
    await $fetch('/api/account/membership/claim', { method: 'POST', body: event.data })
    toast.add({ title: 'Claim sent', description: 'An officer will record it against the SU\'s list.', icon: 'i-lucide-check', color: 'success' })
    claim.studentId = ''
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    submitting.value = false
  }
}

// Asked before it happens (A-130 criterion 9); a refusal stays in the dialogue that asked.
const confirmingWithdrawal = ref(false)
const withdrawFailure = ref<string | null>(null)

function askToWithdraw(): void {
  withdrawFailure.value = null
  confirmingWithdrawal.value = true
}

async function withdraw(): Promise<void> {
  withdrawing.value = true
  withdrawFailure.value = null
  try {
    await $fetch('/api/account/membership/claim', { method: 'DELETE' })
    confirmingWithdrawal.value = false
    toast.add({ title: 'Claim withdrawn', icon: 'i-lucide-undo-2', color: 'neutral' })
    await refresh()
  }
  catch (error) {
    withdrawFailure.value = refusalText(error)
  }
  finally {
    withdrawing.value = false
  }
}

const open = computed(() => data.value.claim?.status === 'OPEN' ? data.value.claim : null)
const declined = computed(() => data.value.claim?.status === 'DECLINED' ? data.value.claim : null)

// Read from /policies/membership rather than baked in, so a fee change needs no code edit (J-110).
const { data: fee } = await useAsyncData(
  'membership-fee',
  () => request<{ values: PolicyValues }>('/api/policies/values', { query: { path: '/policies/membership' } }),
)
const feeValue = computed(() => fee.value?.values.MEMBERSHIP_FEE_PENCE ?? null)

useSeoMeta({ title: 'Membership' })
</script>

<template>
  <UContainer :class="MEMBER_PAGE_WORKING">
    <UPageHeader
      title="Membership"
      description="What the theatre holds about your membership, and how to tell us about one you have bought."
    />

    <div
      class="mt-8 space-y-6"
      data-test="account-membership-page"
    >
      <UAlert
        v-if="listFailure"
        data-test="load-failed"
        color="error"
        variant="subtle"
        icon="i-lucide-unplug"
        :title="listFailure.message"
        description="This is not the same as nothing being recorded. Reload, and if it keeps happening say so."
      />

      <UAlert
        v-if="failure"
        data-test="failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <UPageCard>
        <template #header>
          <h2 class="text-lg font-semibold">
            Your membership
          </h2>
        </template>

        <div
          data-test="membership-state"
          class="space-y-2 text-sm"
        >
          <UBadge
            :color="BADGE_COLOUR[data.state.kind]"
            variant="subtle"
          >
            {{ standing.word }}
          </UBadge>
          <p>{{ standing.says }}</p>
          <p v-if="data.state.kind === 'grace' || data.state.kind === 'lapsed'">
            It ran out on {{ sayDay(data.state.expiredOn) }}.
          </p>
        </div>
      </UPageCard>

      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-badge-check"
        title="Membership is bought at the Students' Union"
        :description="feeValue
          ? `We cannot sell it here. The current fee is ${feeValue.text}. Once you have bought it, tell us below and an officer will record it on your account.`
          : 'We cannot sell it here. Once you have bought it, tell us below and an officer will record it on your account.'"
        data-test="membership-fee"
      />

      <UPageCard v-if="open">
        <template #header>
          <h2 class="text-lg font-semibold">
            Your claim
          </h2>
        </template>

        <div
          data-test="claim-open"
          class="space-y-3 text-sm"
        >
          <UBadge
            color="warning"
            variant="subtle"
          >
            Waiting to be recorded
          </UBadge>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt class="text-muted">
              Student number
            </dt>
            <dd class="font-mono">
              {{ open.studentId }}
            </dd>
            <dt class="text-muted">
              Bought on
            </dt>
            <dd>{{ sayDay(open.startsOn) }}</dd>
            <dt class="text-muted">
              Term
            </dt>
            <dd>{{ termLabel(open.term) }}</dd>
          </dl>
          <p class="text-muted">
            An officer checks it against the SU's list and records it. You will hear either way.
          </p>
          <UButton
            data-test="claim-withdraw"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="withdrawing"
            @click="askToWithdraw"
          >
            Withdraw the claim
          </UButton>
        </div>
      </UPageCard>

      <UPageCard v-else>
        <template #header>
          <h2 class="text-lg font-semibold">
            Tell us about a membership
          </h2>
        </template>

        <UAlert
          v-if="declined"
          data-test="claim-declined"
          color="warning"
          variant="subtle"
          icon="i-lucide-message-square-warning"
          title="Your last claim was not recorded"
          :description="declined.reason ?? ''"
          class="mb-4"
        />

        <UForm
          ref="claimForm"
          data-test="claim-form"
          :schema="membershipClaimForm"
          :state="claim"
          class="space-y-4"
          @submit="submit"
        >
          <UFormField
            name="studentId"
            label="Student number"
            description="How the committee finds you on the SU's list. Names do not always match."
            required
          >
            <UInput
              v-model="claim.studentId"
              data-test="claim-student-id"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="startsOn"
              label="Bought on"
              description="The term runs from this day."
              required
            >
              <DateField
                v-model="claim.startsOn"
                data-test="claim-starts"
                :max="today"
                class="w-full"
              />
            </UFormField>
            <UFormField
              name="term"
              label="Term"
              required
            >
              <USelect
                v-model="claim.term"
                data-test="claim-term"
                :items="MEMBERSHIP_TERMS.map(years => ({ label: termLabel(years), value: years }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
          <UButton
            type="submit"
            data-test="claim-submit"
            :loading="submitting"
          >
            Send the claim
          </UButton>
        </UForm>
      </UPageCard>
    </div>

    <ConfirmModal
      v-model:open="confirmingWithdrawal"
      name="withdraw-claim"
      title="Withdraw the claim"
      verb="Withdraw the claim"
      consequence="No officer records a membership from it. You can send a new claim straight afterwards."
      :loading="withdrawing"
      :failure="withdrawFailure"
      @confirm="withdraw"
    />
  </UContainer>
</template>
