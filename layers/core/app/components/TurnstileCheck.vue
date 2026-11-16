<!-- Cloudflare Turnstile, the one bot check. Emits the token once the check passes. -->
<script setup lang="ts">
const emit = defineEmits<{ token: [value: string] }>()
const siteKey = useRuntimeConfig().public.turnstileSiteKey as string
const box = ref<HTMLElement>()

interface TurnstileApi { render: (element: HTMLElement, options: Record<string, unknown>) => string }

onMounted(async () => {
  if (!siteKey || !box.value) return
  const global = window as unknown as { turnstile?: TurnstileApi }
  if (!global.turnstile) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Turnstile did not load'))
      document.head.appendChild(script)
    })
  }
  global.turnstile!.render(box.value, { 'sitekey': siteKey, 'callback': (token: string) => emit('token', token), 'response-field': false })
})
</script>

<template>
  <div ref="box" />
</template>
