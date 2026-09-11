<script setup lang="ts">
import { formatLondon, startOfLondonDay } from '#shared/utils/london'
import { MEMBERSHIP_TERMS, londonDay } from '#shared/utils/membership'
import { membershipClaimForm } from '#shared/utils/membership-claims'
import type { MembershipClaimInput, MembershipState } from '#shared/utils/membership-claims'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

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

const toast = useToast()
const today = londonDay(new Date())

const { data, refresh } = await useAsyncData<Own>(
  'account-membership',
  () => $fetch<Own>('/api/account/membership'),
  { default: (): Own => ({ membership: null, state: { kind: 'none' }, graceDays: 0, claim: null }) },
)

const sayDay = (day: string): string =>
  formatLondon(startOfLondonDay(day), { day: 'numeric', month: 'long', year: 'numeric' })

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

async function withdraw(): Promise<void> {
  withdrawing.value = true
  failure.value = null
  try {
    await $fetch('/api/account/membership/claim', { method: 'DELETE' })
    toast.add({ title: 'Claim withdrawn', icon: 'i-lucide-undo-2', color: 'neutral' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    withdrawing.value = false
  }
}

const open = computed(() => data.value.claim?.status === 'OPEN' ? data.value.claim : null)
const declined = computed(() => data.value.claim?.status === 'DECLINED' ? data.value.claim : null)

useSeoMeta({ title: 'Membership' })
</script>

<template>
  <UContainer class="max-w-xl py-16">
    <UPageHeader
      title="Membership"
      description="What the theatre holds about your membership, and how to tell us about one you have bought."
    />

    <div
      class="mt-8 space-y-6"
      data-test="account-membership-page"
    >
      <UAlert
        v-if="failure"
        data-test="failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <UPageCard>
        <template #header>
          <h2 class="nnt-headline text-lg">
            Your membership
          </h2>
        </template>

        <div
          data-test="membership-state"
          class="space-y-2 text-sm"
        >
          <template v-if="data.state.kind === 'current'">
            <UBadge
              color="success"
              variant="subtle"
            >
              Current
            </UBadge>
            <p>Your membership runs until {{ sayDay(data.state.until) }}.</p>
          </template>
          <template v-else-if="data.state.kind === 'grace'">
            <UBadge
              color="warning"
              variant="subtle"
            >
              In grace
            </UBadge>
            <p>
              Your membership ran out on {{ sayDay(data.state.expiredOn) }}. It still counts until
              {{ sayDay(data.state.until) }}, which is the {{ data.graceDays }} days we allow for a renewal to reach us.
            </p>
          </template>
          <template v-else-if="data.state.kind === 'lapsed'">
            <UBadge
              color="neutral"
              variant="subtle"
            >
              Lapsed
            </UBadge>
            <p>Your membership lapsed on {{ sayDay(data.state.expiredOn) }}.</p>
          </template>
          <template v-else>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              None
            </UBadge>
            <p>No membership is recorded on your account.</p>
          </template>
        </div>
      </UPageCard>

      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-badge-check"
        title="Membership is bought at the Students' Union"
        description="We cannot sell it here. Once you have bought it, tell us below and an officer will record it on your account."
      />

      <UPageCard v-if="open">
        <template #header>
          <h2 class="nnt-headline text-lg">
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
            @click="withdraw"
          >
            Withdraw
          </UButton>
        </div>
      </UPageCard>

      <UPageCard v-else>
        <template #header>
          <h2 class="nnt-headline text-lg">
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
  </UContainer>
</template>
