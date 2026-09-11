<script setup lang="ts">
type Outcome = 'working' | 'found' | 'refused'

interface Pass {
  reference: string
  passType: string
  priceLabel: string
  pricePaid: string
  status: string
  qrSvg: string
}

const outcome = ref<Outcome>('working')
const pass = ref<Pass | null>(null)

onMounted(async () => {
  try {
    pass.value = await $fetch<Pass>('/api/passes/current')
    outcome.value = 'found'
  }
  catch {
    outcome.value = 'refused'
  }
})

const statusColor: Record<string, 'success' | 'neutral' | 'error'> = {
  ACTIVE: 'success',
  CANCELLED: 'error',
  EXPIRED: 'neutral',
}

useSeoMeta({
  title: 'Your pass',
  description: 'The pass held on this device, and what it admits you to.',
})
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <div
        v-if="outcome === 'working'"
        class="flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Finding your pass.</span>
      </div>

      <div
        v-else-if="outcome === 'found' && pass"
        data-test="pass-found"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          {{ pass.passType }}
        </h1>
        <p class="text-muted">
          {{ pass.priceLabel }}, {{ pass.pricePaid }}
        </p>
        <p class="text-sm text-muted">
          Reference {{ pass.reference }}
        </p>
        <UBadge
          data-test="pass-status"
          size="lg"
          :color="statusColor[pass.status] ?? 'neutral'"
        >
          {{ pass.status }}
        </UBadge>
        <img
          :src="`data:image/svg+xml;base64,${pass.qrSvg}`"
          alt="Pass QR code"
          width="200"
          height="200"
          data-test="pass-qr"
        >
        <p class="text-xs text-muted">
          Save this image to keep the code, or show this page at the door.
        </p>
      </div>

      <div
        v-else
        data-test="pass-refused"
        class="space-y-2"
      >
        <h1 class="nnt-headline text-xl">
          That link isn't valid
        </h1>
        <p class="text-muted">
          Open your pass from the email you were sent when it was issued, or view it from your
          account while signed in.
        </p>
      </div>
    </UPageCard>
  </UContainer>
</template>
