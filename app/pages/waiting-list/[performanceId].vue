<script setup lang="ts">
import { saysNoSuch } from '#shared/utils/no-such'
import { saysWhenLong } from '#shared/utils/when'
import { MAX_PARTY_SIZE, waitingListGuestJoinForm, waitingListPartyForm } from '#shared/utils/waiting-list'
import type { SaleRefusalReason } from '#shared/utils/programme'
import type { FormSubmitEvent } from '@nuxt/ui'

// Join the waiting list for a performance (D-113 criteria 1 and 6). A full house never refuses a
// join; online booking having closed does, since nothing is offered after it (issue 1328).

interface BookingInfo {
  show: { slug: string, title: string }
  performance: { startsAt: number, venueName: string }
  refusal: { reason: SaleRefusalReason | 'SOLD_OUT', says: string } | null
}

const route = useRoute()
const performanceId = computed(() => String(route.params.performanceId))
const { account } = useAccount()

// The same public read the booking screen makes, for the one thing this screen was missing: which
// show and which night the list is for.
const { data } = await useFetch<BookingInfo>(() => `/api/performances/${performanceId.value}/booking`)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: saysNoSuch('performance', 'Go back to what is on and choose another'), fatal: true })
}

const when = computed(() => saysWhenLong(data.value!.performance.startsAt))

const closed = computed(() => (data.value?.refusal?.reason === 'WINDOW_CLOSED' ? data.value.refusal.says : null))

const schema = computed(() => (account.value.signedIn ? waitingListPartyForm : waitingListGuestJoinForm))

const state = reactive({ partySize: 1, name: '', email: '' })

const submitting = ref(false)
const notice = ref<string | null>(null)
const joined = ref(false)
const emailed = ref(true)

async function join(event: FormSubmitEvent<{ partySize: number, name?: string, email?: string }>): Promise<void> {
  notice.value = null
  submitting.value = true
  try {
    const body: { performanceId: string, partySize: number, guest?: { name: string, email: string } } = {
      performanceId: performanceId.value,
      partySize: event.data.partySize,
    }
    if (!account.value.signedIn) body.guest = { name: event.data.name!.trim(), email: event.data.email!.trim() }

    const result = await $fetch<{ emailed: boolean }>(`/api/performances/${performanceId.value}/waiting-list`, { method: 'POST', body })
    emailed.value = result.emailed
    joined.value = true
  }
  catch (error) {
    notice.value = refusalText(error, 'Could not join the waiting list')
  }
  finally {
    submitting.value = false
  }
}

useSeoMeta({
  title: 'Join the waiting list',
  description: () => `Join the waiting list for ${data.value?.show.title ?? 'a performance'} at the Nottingham New Theatre.`,
})
</script>

<template>
  <UContainer
    class="max-w-2xl py-16"
    data-test="waiting-list-join-page"
  >
    <UBreadcrumb
      class="mb-6"
      :items="[
        { label: data!.show.title, to: `/shows/${data!.show.slug}` },
        { label: 'Waiting list' },
      ]"
    />

    <h1 class="nnt-headline text-3xl">
      Join the waiting list
    </h1>
    <p
      class="mt-2 text-muted"
      data-test="waiting-list-for"
    >
      {{ data!.show.title }} · {{ when }} · {{ data!.performance.venueName }}
    </p>

    <div
      v-if="joined"
      class="mt-8 space-y-3"
      data-test="waiting-list-joined"
    >
      <UAlert
        v-if="emailed"
        color="success"
        variant="subtle"
        icon="i-lucide-clock"
        title="You are on the list"
        description="We will email you the moment seats free up, in the order people joined. Every email carries a link to leave the list."
      />
      <UAlert
        v-else
        color="warning"
        variant="subtle"
        icon="i-lucide-mail-warning"
        title="You are on the list, but we could not email you"
        description="Your place is held in the order people joined. The confirmation did not go out, so ask the box office to check your entry before the performance."
        data-test="waiting-list-not-emailed"
      />
      <UButton
        to="/whats-on"
        variant="link"
      >
        Back to what's on
      </UButton>
    </div>

    <div
      v-else-if="closed"
      class="mt-8 space-y-3"
    >
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-ticket-x"
        title="Online booking has closed"
        :description="closed"
        data-test="waiting-list-closed"
      />
      <UButton
        :to="`/shows/${data!.show.slug}`"
        variant="link"
      >
        Back to {{ data!.show.title }}
      </UButton>
    </div>

    <UForm
      v-else
      :schema="schema"
      :state="state"
      class="mt-8 space-y-6"
      @submit="join"
    >
      <UAlert
        v-if="notice"
        color="error"
        variant="subtle"
        :description="notice"
        data-test="waiting-list-notice"
      />

      <UFormField
        label="Party size"
        name="partySize"
        :description="`Up to ${MAX_PARTY_SIZE}, including yourself. An offer covers the whole party.`"
      >
        <UInputNumber
          v-model="state.partySize"
          v-bind="TOUCH_STEPPER"
          :min="1"
          :max="MAX_PARTY_SIZE"
          data-test="waiting-list-party-size"
        />
      </UFormField>

      <UCard v-if="!account.signedIn">
        <template #header>
          <h2 class="font-semibold">
            Your details
          </h2>
        </template>
        <div class="space-y-4">
          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
              autocomplete="name"
              data-test="waiting-list-guest-name"
            />
          </UFormField>
          <UFormField
            label="Email address"
            name="email"
            required
            description="We will email you here the moment a seat is offered."
          >
            <UInput
              v-model="state.email"
              type="email"
              class="w-full"
              autocomplete="email"
              data-test="waiting-list-guest-email"
            />
          </UFormField>
        </div>
      </UCard>

      <UButton
        type="submit"
        :loading="submitting"
        data-test="waiting-list-submit"
      >
        Join the waiting list
      </UButton>
    </UForm>
  </UContainer>
</template>
