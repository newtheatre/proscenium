<!-- The card that tells a guest buyer they can open an account (the sign-in review, item 2). The
     account was made when they booked; their booking email carries a link that opens it. With a
     booking link, "Send me the link again" asks for a fresh one and says what happened: sent, the
     account is open already, or too many asked for. Shown only to somebody who is not signed in,
     and only where the email could carry the link. -->
<script setup lang="ts">
type Outcome = 'sent' | 'claimed' | 'limited' | 'unavailable' | 'failed'
const props = defineProps<{ orderToken?: string }>()
const { t } = useT()
const { $api } = useNuxtApp()
const dismissed = ref(false)
const sent = ref<Outcome | null>(null)

async function sendAgain() {
  if (!props.orderToken) return
  const answer = await $api<{ outcome?: Outcome }>('/api/box-office/orders/link/account' as string, { method: 'POST', body: {}, headers: { 'x-order-token': props.orderToken } }).catch(() => null)
  sent.value = !answer?.outcome || answer.outcome === 'unavailable' ? 'failed' : answer.outcome
}
</script>

<template>
  <UCard
    v-if="!dismissed"
    variant="subtle"
  >
    <div class="space-y-2">
      <h2 class="font-semibold text-highlighted">
        {{ t('box-office.account-card.title') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('box-office.account-card.body') }}
      </p>
      <p
        v-if="sent"
        role="status"
        class="text-sm"
      >
        {{ t(`box-office.account-card.outcome.${sent}`) }}
        <ULink
          v-if="sent === 'claimed'"
          to="/sign-in"
          class="font-medium text-primary"
        >
          {{ t('box-office.account-card.sign-in') }}
        </ULink>
      </p>
      <div class="flex flex-wrap gap-2 pt-1">
        <UButton
          v-if="orderToken && (!sent || sent === 'failed')"
          loading-auto
          :label="t('box-office.account-card.send')"
          @click="sendAgain()"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('box-office.account-card.dismiss')"
          @click="dismissed = true"
        />
      </div>
    </div>
  </UCard>
</template>
