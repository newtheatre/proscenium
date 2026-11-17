<!-- The card that tells a guest buyer they can open an account (the sign-in review, item 2). The
     account was made when they booked; their confirmation email carries a link that opens it. With a
     booking link, "Send me the link again" asks for a fresh one; the answer never says whether
     anything was sent. Shown only to somebody who is not signed in. -->
<script setup lang="ts">
const props = defineProps<{ orderToken?: string }>()
const { t } = useT()
const { $api } = useNuxtApp()
const dismissed = ref(false)
const sent = ref(false)

async function sendAgain() {
  if (!props.orderToken) return
  await $api('/api/box-office/orders/link/account' as string, { method: 'POST', body: {}, headers: { 'x-order-token': props.orderToken } }).catch(() => undefined)
  sent.value = true
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
        {{ t('box-office.account-card.sent') }}
      </p>
      <div class="flex flex-wrap gap-2 pt-1">
        <UButton
          v-if="orderToken && !sent"
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
