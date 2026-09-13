<script setup lang="ts">
// Join the waiting list for a performance (D-113 criterion 1). No availability check here: a
// join is refused server-side only by a duplicate, never by whether the house happens to be full.

const route = useRoute()
const performanceId = computed(() => String(route.params.performanceId))
const { account } = useAccount()

const partySize = ref(1)
const guestName = ref('')
const guestEmail = ref('')

const submitting = ref(false)
const notice = ref<string | null>(null)
const joined = ref(false)
const emailed = ref(true)

async function join(): Promise<void> {
  notice.value = null

  if (!account.value.signedIn && (!guestName.value.trim() || !guestEmail.value.trim())) {
    notice.value = 'A name and an email address are required to join as a guest'
    return
  }

  submitting.value = true
  try {
    const body: { performanceId: string, partySize: number, guest?: { name: string, email: string } } = {
      performanceId: performanceId.value,
      partySize: partySize.value,
    }
    if (!account.value.signedIn) body.guest = { name: guestName.value.trim(), email: guestEmail.value.trim() }

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

useSeoMeta({ title: 'Join the waiting list' })
</script>

<template>
  <UContainer
    class="max-w-2xl py-16"
    data-test="waiting-list-join-page"
  >
    <h1 class="nnt-headline text-3xl">
      Join the waiting list
    </h1>

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
        title="You're on the list"
        description="We'll email you the moment seats free up, in the order people joined. Every email carries a link to leave the list."
      />
      <UAlert
        v-else
        color="warning"
        variant="subtle"
        icon="i-lucide-mail-warning"
        title="You're on the list, but we could not email you"
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
      v-else
      class="mt-8 space-y-6"
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
        description="Up to 10, including yourself."
      >
        <UInputNumber
          v-model="partySize"
          :min="1"
          :max="10"
          class="w-28"
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
            required
          >
            <UInput
              v-model="guestName"
              class="w-full"
              autocomplete="name"
              data-test="waiting-list-guest-name"
            />
          </UFormField>
          <UFormField
            label="Email address"
            required
            description="We'll email you here the moment a seat is offered."
          >
            <UInput
              v-model="guestEmail"
              type="email"
              class="w-full"
              autocomplete="email"
              data-test="waiting-list-guest-email"
            />
          </UFormField>
        </div>
      </UCard>

      <UButton
        :loading="submitting"
        data-test="waiting-list-submit"
        @click="join"
      >
        Join the waiting list
      </UButton>
    </div>
  </UContainer>
</template>
