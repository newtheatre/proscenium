<script setup lang="ts">
import { CAMERA_FALLBACK_SAYS } from '#shared/utils/door'
import type { ScannerFailure } from '#shared/utils/door'

// The door's camera (E-129). A live view with a scanning frame, and one decoded string out. The
// screen decides what a code means; nothing here knows about bookings, passes or performances.
const emit = defineEmits<{ decoded: [value: string], unavailable: [failure: ScannerFailure] }>()

const video = useTemplateRef<HTMLVideoElement>('video')
const scanner = useQrScanner(value => emit('decoded', value))

watch(scanner.failure, (failure) => {
  if (failure) emit('unavailable', failure)
})

onMounted(async () => {
  if (video.value) await scanner.start(video.value)
})

// Stopped on hidden and on unmount both, or a phone in a pocket films all evening (criterion 4).
// Coming back reopens it: the component outlives a verdict, so nothing else would restart it.
async function followVisibility(): Promise<void> {
  if (document.visibilityState === 'hidden') scanner.stop()
  else if (!scanner.active.value && !scanner.failure.value && video.value) await scanner.start(video.value)
}

onMounted(() => document.addEventListener('visibilitychange', followVisibility))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', followVisibility)
  scanner.stop()
})

defineExpose({ stop: scanner.stop })
</script>

<template>
  <div data-test="qr-scanner">
    <UAlert
      v-if="scanner.failure.value"
      color="neutral"
      variant="subtle"
      icon="i-lucide-camera-off"
      :description="CAMERA_FALLBACK_SAYS[scanner.failure.value]"
      data-test="qr-scanner-unavailable"
    />

    <div
      v-else
      class="relative overflow-hidden rounded-xl bg-black"
    >
      <video
        ref="video"
        class="aspect-square w-full object-cover"
        muted
        autoplay
        playsinline
        aria-label="Camera view for scanning a ticket QR code"
      />

      <!-- The gold frame is where to hold the code, so it is decoration and never announced. -->
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div class="size-2/3 rounded-lg border-2 border-gold-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <!-- The verdict sits over the live view: unmounting the scanner between two patrons costs
           a tap and a camera cold start each time (E-129, issue 1150 item 1). -->
      <div
        v-if="$slots.overlay"
        class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-3"
      >
        <slot name="overlay" />
      </div>

      <UButton
        v-if="scanner.torchAvailable.value"
        :icon="scanner.torchOn.value ? 'i-lucide-flashlight-off' : 'i-lucide-flashlight'"
        :aria-label="scanner.torchOn.value ? 'Turn the torch off' : 'Turn the torch on'"
        color="neutral"
        variant="solid"
        size="lg"
        class="absolute bottom-3 right-3 min-h-12 min-w-12 justify-center"
        data-test="qr-scanner-torch"
        @click="scanner.toggleTorch()"
      />
    </div>

    <p
      v-if="!scanner.failure.value"
      class="mt-2 text-center text-sm text-muted"
      data-test="qr-scanner-hint"
    >
      Hold the code inside the frame.
    </p>
  </div>
</template>
