<script setup lang="ts">
import { PASS_TERMS_PATH, saysPassOffer } from '#shared/utils/passes'
import { saysPrice } from '#shared/utils/ticket-types'
import type { PassOffer } from '#shared/utils/passes'

// D-139 (0261): a season pass chosen while booking, signed in or not. The seat goes on the pass and
// both are held; the pass is paid for at the till the first night (0005), never here.
const props = defineProps<{
  offers: PassOffer[]
  signedIn: boolean
  performanceId: string
}>()

const emit = defineEmits<{ chosen: [emailedTo: string | null] }>()

const priceIds = ref<Record<string, string | undefined>>({})
const name = ref('')
const email = ref('')
const choosing = ref<string | null>(null)
const failure = ref<string | null>(null)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const detailsReady = computed(() => props.signedIn || (name.value.trim() !== '' && EMAIL.test(email.value.trim())))

function priceItems(offer: PassOffer): { label: string, value: string }[] {
  return offer.prices.map(price => ({ label: `${price.label} · ${saysPrice(price.price)}`, value: price.id }))
}

async function choose(offer: PassOffer): Promise<void> {
  const passTypePriceId = priceIds.value[offer.id] ?? (offer.prices.length === 1 ? offer.prices[0]!.id : undefined)
  if (!passTypePriceId) {
    failure.value = 'Choose which price applies to you first.'
    return
  }
  choosing.value = offer.id
  failure.value = null
  try {
    const guest = props.signedIn ? undefined : { name: name.value.trim(), email: email.value.trim() }
    await $fetch('/api/passes/choose', { method: 'POST', body: { performanceId: props.performanceId, passTypePriceId, guest } })
    emit('chosen', guest?.email ?? null)
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    choosing.value = null
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

    <p class="mb-4 text-sm text-muted">
      Book this seat on a season pass instead. Nothing is paid now: you pay for the pass at the till the first night you come, and it covers the rest.
    </p>

    <UAlert
      v-if="failure"
      class="mb-4"
      color="error"
      variant="subtle"
      :description="failure"
      data-test="pass-offer-notice"
    />

    <div
      v-if="!props.signedIn"
      class="mb-4 grid gap-2 sm:grid-cols-2"
    >
      <UInput
        v-model="name"
        autocomplete="name"
        placeholder="Your name"
        aria-label="Your name, for the pass"
        data-test="pass-offer-name"
      />
      <UInput
        v-model="email"
        type="email"
        autocomplete="email"
        placeholder="Your email"
        aria-label="Your email, for the pass"
        data-test="pass-offer-email"
      />
    </div>

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
        <URadioGroup
          v-if="offer.prices.length > 1"
          v-model="priceIds[offer.id]"
          :items="priceItems(offer)"
          :data-test="`pass-offer-prices-${offer.id}`"
        />
        <UButton
          size="sm"
          variant="subtle"
          :loading="choosing === offer.id"
          :disabled="!detailsReady || offer.prices.length === 0"
          :data-test="`pass-offer-choose-${offer.id}`"
          @click="choose(offer)"
        >
          Book this seat on the {{ offer.name }}
        </UButton>
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
