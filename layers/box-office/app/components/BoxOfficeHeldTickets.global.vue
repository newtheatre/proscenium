<!-- In the public header while this tab holds tickets (Matt, 21 November 2026): the time left, and
     the way back to Check and pay, so a buyer who wanders off to read about the show knows a clock
     is running. Nothing is drawn on the booking pages themselves, which show the countdown already. -->
<script setup lang="ts">
const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()

const expiresAt = ref<number | null>(null)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

async function look() {
  const remembered = recallBasket()
  if (!remembered) return (expiresAt.value = null)
  const basket = await $api<{ state: string, expiresAt: number | null }>(`/api/box-office/baskets/${encodeURIComponent(remembered.orderId)}`, { headers: { 'x-basket-token': remembered.token } }).catch(() => null)
  expiresAt.value = basket?.state === 'basket' && basket.expiresAt && basket.expiresAt > Date.now() ? basket.expiresAt : null
}
onMounted(() => {
  void look()
  window.addEventListener(BASKET_CHANGED, look)
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  window.removeEventListener(BASKET_CHANGED, look)
  clearInterval(timer)
})
watch(() => route.path, look)

const left = computed(() => expiresAt.value ? Math.max(0, Math.floor((expiresAt.value - now.value) / 1000)) : 0)
const clock = computed(() => `${Math.floor(left.value / 60)}:${String(left.value % 60).padStart(2, '0')}`)
const shown = computed(() => left.value > 0 && !route.path.startsWith('/book/'))
</script>

<template>
  <UButton
    v-if="shown"
    to="/book/basket"
    color="neutral"
    variant="outline"
    icon="i-lucide-timer"
    :aria-label="t('box-office.held.aria', { time: clock })"
  >
    <span class="max-sm:hidden">{{ t('box-office.held.label') }}</span>
    <span class="tabular-nums">{{ clock }}</span>
  </UButton>
</template>
