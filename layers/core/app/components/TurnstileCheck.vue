<!-- Cloudflare Turnstile, the one bot check. Emits the token once the check passes, and an empty
     token when it runs out, so a form never sends a stale one. Nuxt's Turnstile module loads the
     script, resets the check before it expires and removes it with the component. With no site key
     the check is quietly off, as it is on the server with no secret. -->
<script setup lang="ts">
const emit = defineEmits<{ token: [value: string] }>()
const { t } = useT()
const siteKey = useRuntimeConfig().public.turnstile.siteKey
const token = ref('')
const failed = ref(false)
watch(token, (value) => {
  if (value) failed.value = false
  emit('token', value)
})
const options = {
  'response-field': false,
  'expired-callback': () => { token.value = '' },
  'error-callback': () => {
    token.value = ''
    failed.value = true
  },
}
</script>

<template>
  <div v-if="siteKey">
    <NuxtTurnstile
      v-model="token"
      :options="options"
    />
    <UAlert
      v-if="failed"
      role="alert"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('core.challenge.unavailable')"
      :description="t('core.challenge.unavailable-remedy')"
    />
  </div>
</template>
