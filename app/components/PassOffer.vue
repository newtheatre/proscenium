<script setup lang="ts">
import { PASS_TERMS_PATH, saysPassOffer, saysPayAtDesk } from '#shared/utils/passes'
import { withNext } from '#shared/utils/sign-in'
import type { PassOffer } from '#shared/utils/passes'

// D-133: the season pass offered beside a booking. Asking moves no money and reserves nothing
// (0005); a guest is sent to make an account first, since a pass always needs one.
const props = defineProps<{
  offers: PassOffer[]
  signedIn: boolean
  returnTo: string
}>()

const toast = useToast()
const asked = ref<string[]>([])
const asking = ref<string | null>(null)
const failure = ref<string | null>(null)

const isAsked = (offer: PassOffer): boolean => offer.requested || asked.value.includes(offer.id)

async function ask(offer: PassOffer): Promise<void> {
  asking.value = offer.id
  failure.value = null
  try {
    await $fetch('/api/account/passes/request', { method: 'POST', body: { passTypeId: offer.id } })
    asked.value.push(offer.id)
    toast.add({ title: `${offer.name} requested`, icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    asking.value = null
  }
}
</script>

<template>
  <UCard
    v-if="props.offers.length"
    data-test="pass-offer"
  >
    <template #header>
      <h2 class="font-semibold">
        Coming to more shows?
      </h2>
    </template>

    <UAlert
      v-if="failure"
      class="mb-4"
      color="error"
      variant="subtle"
      :description="failure"
      data-test="pass-offer-notice"
    />

    <ul class="space-y-4 text-sm">
      <li
        v-for="offer in props.offers"
        :key="offer.id"
        class="space-y-2"
        :data-test="`pass-offer-${offer.id}`"
      >
        <p class="font-medium">
          {{ saysPassOffer(offer) }}
        </p>
        <p
          v-if="offer.description"
          class="text-muted"
        >
          {{ offer.description }}
        </p>
        <p
          v-if="isAsked(offer)"
          class="text-muted"
          :data-test="`pass-offer-asked-${offer.id}`"
        >
          You have asked for this pass. {{ saysPayAtDesk(offer.prices) }} when you arrive.
        </p>
        <div
          v-else-if="props.signedIn"
          class="flex flex-wrap items-center gap-3"
        >
          <UButton
            size="sm"
            variant="subtle"
            :loading="asking === offer.id"
            :data-test="`pass-offer-ask-${offer.id}`"
            @click="ask(offer)"
          >
            Ask for this pass
          </UButton>
          <span class="text-muted">Nothing to pay now. {{ saysPayAtDesk(offer.prices) }} when you arrive.</span>
        </div>
        <div
          v-else
          class="flex flex-wrap items-center gap-3"
          :data-test="`pass-offer-guest-${offer.id}`"
        >
          <UButton
            size="sm"
            variant="subtle"
            :to="withNext('/register', props.returnTo)"
          >
            Create an account to ask for it
          </UButton>
          <NuxtLink
            class="text-muted underline"
            :to="withNext('/sign-in', props.returnTo)"
          >
            or sign in
          </NuxtLink>
        </div>
      </li>
    </ul>
    <p class="mt-4 text-xs text-muted">
      <NuxtLink
        class="underline"
        :to="PASS_TERMS_PATH"
        data-test="pass-offer-terms"
      >
        The ticket and pass terms
      </NuxtLink>
    </p>
  </UCard>
</template>
