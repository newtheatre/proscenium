<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysPassOffer } from '#shared/utils/passes'
import type { PassOffer } from '#shared/utils/passes'
import type { TillPassLine } from '~/composables/useTillPass'

// The Season pass pane (D-134): a pass covering tonight's show, kept on the buyer's email with or
// without an account (D-138). The sale is the ordinary charge, through the reader with the basket.

defineProps<{
  offers: PassOffer[]
  failure: string | null
  emailValid: boolean
  inBasket: TillPassLine | null
  add: () => void
}>()

const email = defineModel<string>('email', { required: true })
const name = defineModel<string>('name', { required: true })
const priceId = defineModel<string | undefined>('priceId')
</script>

<template>
  <div
    class="space-y-4"
    data-test="pass-pane"
  >
    <p class="text-xs text-muted">
      Type their email address; the pass and its QR are emailed there, and they need no account. Add their name if they have never booked with us.
    </p>
    <UAlert
      v-if="failure"
      color="warning"
      variant="subtle"
      :description="failure"
    />
    <NightBlock
      v-for="offer in offers"
      :key="offer.id"
      :title="offer.name"
      :data-test="`till-pass-${offer.id}`"
    >
      <p class="text-sm">
        {{ saysPassOffer(offer) }}
      </p>
      <p
        v-if="offer.description"
        class="mt-1 text-xs text-muted"
      >
        {{ offer.description }}
      </p>
      <URadioGroup
        v-model="priceId"
        class="mt-3"
        :items="offer.prices.map(price => ({ label: `${price.label} · ${saysMoney(price.price)}`, value: price.id }))"
        :data-test="`till-pass-prices-${offer.id}`"
      />
    </NightBlock>
    <NightBlock
      v-if="offers.length"
      title="Buyer"
    >
      <UInput
        v-model="email"
        type="email"
        autocapitalize="off"
        placeholder="Their email"
        aria-label="Buyer's email"
        class="w-full"
        data-test="till-pass-email"
      />
      <UInput
        v-model="name"
        autocomplete="off"
        placeholder="Their name, if new to us"
        aria-label="Buyer's name"
        class="mt-2 w-full"
        data-test="till-pass-name"
      />
      <UButton
        class="mt-3 min-h-12"
        color="neutral"
        variant="subtle"
        :disabled="!priceId || !emailValid || inBasket !== null"
        data-test="till-pass-add"
        @click="add"
      >
        {{ inBasket ? 'A pass is already in the basket' : 'Add the pass' }}
      </UButton>
      <p class="mt-2 text-xs text-muted">
        A booking of theirs for one seat tonight moves onto the pass when it is charged, so they pay once.
      </p>
    </NightBlock>
  </div>
</template>
