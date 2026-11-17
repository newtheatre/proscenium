<!-- The online card form (Box office specification, part 4): Payments' form for a provider that takes
     the card on the page itself, which is Stripe's Payment Element. The card goes from the buyer's
     browser to Stripe and never reaches this site. The page that hosts the form owns the payment's
     story: the form says only that the provider accepted the payment (submitted), and the host asks
     the server for the answer, because a webhook or refreshIntent settles it, never the browser.
     A declined card is shown here and the buyer may try another. A payment method that needs a bank's
     own page sends the buyer there and back to returnUrl, with Stripe's payment_intent and
     redirect_status added to it. -->
<script setup lang="ts">
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from '@stripe/stripe-js'

interface CardStep { kind: 'client-secret', provider: string, secret: string, publishableKey: string }

const props = defineProps<{
  next: CardStep
  /** The button, which says what it does and what it costs: "Pay £20.00". */
  label: string
  /** An absolute address on this site for the buyer to come back to from a bank's page. */
  returnUrl: string
  disabled?: boolean
  /** The host offers another way to pay: a button to leave the form shows, and emits cancelled. */
  cancellable?: boolean
}>()
const emit = defineEmits<{ submitted: [{ state: 'succeeded' | 'processing' }], cancelled: [] }>()

const { t } = useT()
const colorMode = useColorMode()
const { data: settings } = usePublicSettings()

const host = ref<HTMLElement | null>(null)
const state = ref<'loading' | 'ready' | 'unavailable'>('loading')
const busy = ref(false)
const problem = ref('')
let stripe: Stripe | null = null
let elements: StripeElements | null = null
let element: StripePaymentElement | null = null

// Stripe's own messages for a card it refused, in the buyer's language; anything else is ours.
const BUYER_ERRORS = ['card_error', 'validation_error']

onMounted(async () => {
  if (props.next.provider !== 'stripe' || !props.next.publishableKey) {
    state.value = 'unavailable'
    return
  }
  try {
    stripe = await loadStripe(props.next.publishableKey)
  }
  catch {
    stripe = null
  }
  if (!stripe || !host.value) {
    state.value = 'unavailable'
    return
  }
  const language = (settings.value?.['core.locale.language']?.value as string | undefined) || 'en-GB'
  elements = stripe.elements({
    clientSecret: props.next.secret,
    locale: language as 'en-GB',
    appearance: { theme: colorMode.value === 'dark' ? 'night' : 'stripe' },
  })
  element = elements.create('payment', { layout: 'tabs' })
  element.on('ready', () => { state.value = 'ready' })
  element.on('loaderror', () => { state.value = 'unavailable' })
  element.mount(host.value)
})

onBeforeUnmount(() => element?.destroy())

async function pay() {
  if (!stripe || !elements || busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, confirmParams: { return_url: props.returnUrl }, redirect: 'if_required' })
    if (error) problem.value = BUYER_ERRORS.includes(error.type) && error.message ? error.message : t('payments.screens.card-form.failed')
    else if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') emit('submitted', { state: paymentIntent.status })
    else problem.value = t('payments.screens.card-form.declined')
  }
  catch {
    problem.value = t('payments.screens.card-form.failed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="state === 'unavailable'"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('payments.screens.card-form.unavailable')"
      :description="t('payments.screens.card-form.unavailable-remedy')"
    />
    <p
      v-else-if="state === 'loading'"
      class="text-sm text-muted"
    >
      {{ t('payments.screens.card-form.loading') }}
    </p>
    <div
      v-show="state === 'ready'"
      ref="host"
    />
    <UAlert
      v-if="problem"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-credit-card"
      :title="problem"
    />
    <p
      v-if="state === 'ready'"
      class="flex items-center gap-2 text-sm text-muted"
    >
      <UIcon name="i-lucide-lock" />
      <span>{{ t('payments.screens.card-form.secure') }}</span>
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="state === 'ready'"
        size="lg"
        :loading="busy"
        :disabled="disabled"
        :label="label"
        @click="pay"
      />
      <UButton
        v-if="cancellable"
        size="lg"
        color="neutral"
        variant="outline"
        :disabled="busy"
        :label="t('payments.screens.card-form.another-way')"
        @click="emit('cancelled')"
      />
    </div>
  </div>
</template>
