<script setup lang="ts">
import { saysNoSuch } from '#shared/utils/no-such'
import { saysWhenLong } from '#shared/utils/when'
import { MAX_PARTY_SIZE, waitingListGuestJoinForm, waitingListPartyForm } from '#shared/utils/waiting-list'
import type { SaleRefusalReason } from '#shared/utils/programme'
import type { FormSubmitEvent } from '@nuxt/ui'

// Join the waiting list for a performance (D-113 criteria 1 and 6). A full house never refuses a
// join; online booking having closed does (issue 1328), and seats on sale send the reader to book (0120).

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

// No refusal at all is a house still selling: the list is only for a party bigger than what is left,
// so the form waits behind a choice and the server refuses a party the seats would hold (0120).
const onSale = computed(() => data.value?.refusal === null)
const biggerParty = ref(false)

const schema = computed(() => (account.value.signedIn ? waitingListPartyForm : waitingListGuestJoinForm))

const state = reactive({ partySize: 1, name: '', email: '' })

const submitting = ref(false)
const notice = ref<string | null>(null)
const bookUrl = ref<string | null>(null)
const joined = ref(false)
const emailed = ref(true)

async function join(event: FormSubmitEvent<{ partySize: number, name?: string, email?: string }>): Promise<void> {
  notice.value = null
  bookUrl.value = null
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
    bookUrl.value = refusalData<{ bookUrl?: string }>(error)?.bookUrl ?? null
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
        description="We will email you the moment seats free up, in the order people joined. Every email links to your entry, where you can leave the list."
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

    <div
      v-else-if="onSale && !biggerParty"
      class="mt-8 space-y-4"
      data-test="waiting-list-on-sale"
    >
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-ticket"
        title="Seats are still on sale"
        description="There is no need to wait: book the seats you want now. The waiting list is for a party bigger than the seats that are left."
      />
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          :to="`/book/${performanceId}`"
          variant="marquee"
          data-test="waiting-list-book"
        >
          Book tickets
        </UButton>
        <UButton
          variant="link"
          color="neutral"
          data-test="waiting-list-bigger-party"
          @click="biggerParty = true"
        >
          My party needs more seats than are left
        </UButton>
      </div>
    </div>

    <!-- novalidate: the browser's own check on the address field would stop the submit before
         the form's messages, so a blank name would never be named beside it (D-113 criterion 6). -->
    <UForm
      v-else
      :schema="schema"
      :state="state"
      class="mt-8 space-y-6"
      novalidate
      @submit="join"
    >
      <UAlert
        v-if="notice"
        color="error"
        variant="subtle"
        :description="notice"
        data-test="waiting-list-notice"
      />
      <UButton
        v-if="bookUrl"
        :to="bookUrl"
        variant="marquee"
      >
        Book tickets
      </UButton>

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
