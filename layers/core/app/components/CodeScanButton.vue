<!-- Scan a code with the device's camera: a button that opens the camera in a dialog and reads the
     first QR code it sees. Most people have no barcode scanner, but every phone and most laptops have
     a camera. The browser's own barcode reader is used where there is one, and jsQR otherwise, which
     reads the picture on the device: nothing is sent anywhere. Typing stays the fallback on every
     screen that uses this, so a missing camera, a refused permission or a page that is not secure
     never stops anyone; the dialog says which it was.

     With `continuous`, the dialog stays open and reads one code after another, as at the door; the
     same code is not read twice in a row within a few seconds, so a ticket held up to the camera is
     scanned once. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** The button's words, when "Scan with camera" is not right. */
  label?: string
  /** Keep scanning after a read, for scanning many codes in a row. */
  continuous?: boolean
  disabled?: boolean
  /** Shown under the picture while it is open: the last result, so a door can scan without looking away. */
  status?: string | null
  statusColor?: 'success' | 'warning' | 'error' | 'neutral'
  /** A box in the dialog to type a code instead, for a screen with nowhere else to type one. */
  typing?: boolean
}>(), { label: undefined, continuous: false, disabled: false, status: null, statusColor: 'neutral', typing: false })
const emit = defineEmits<{ scanned: [code: string] }>()

const { t } = useT()
const open = ref(false)
const video = ref<HTMLVideoElement | null>(null)
const problem = ref<'insecure' | 'no-camera' | 'denied' | 'failed' | null>(null)
const starting = ref(false)
const typed = ref('')
function submitTyped() {
  const code = typed.value.trim()
  if (!code) return
  typed.value = ''
  emit('scanned', code)
  if (!props.continuous) open.value = false
}
let stream: MediaStream | null = null
let frame = 0
let canvas: HTMLCanvasElement | null = null
let last = { code: '', at: 0 }
// Not read again within this long, so a code held still is one scan. Interface timing, not policy.
const REPEAT_MS = 3000 // not-policy: how long one code held to the camera counts as one scan
type Detect = (source: HTMLVideoElement) => Promise<string | null>
let detect: Detect | null = null

async function reader(): Promise<Detect> {
  // The browser's own reader, where it has one that knows QR codes.
  const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }, getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  if (Native && (await Native.getSupportedFormats?.().catch(() => []) ?? []).includes('qr_code')) {
    const native = new Native({ formats: ['qr_code'] })
    return async source => (await native.detect(source))[0]?.rawValue ?? null
  }
  const { default: jsQR } = await import('jsqr')
  canvas ??= document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  return async (source) => {
    const width = source.videoWidth
    const height = source.videoHeight
    if (!width || !height) return null
    canvas!.width = width
    canvas!.height = height
    context.drawImage(source, 0, 0, width, height)
    return jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

async function start() {
  problem.value = null
  last = { code: '', at: 0 }
  if (!window.isSecureContext) {
    problem.value = 'insecure'
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    problem.value = 'no-camera'
    return
  }
  starting.value = true
  try {
    // The camera facing away from the screen, on a phone or tablet; any camera elsewhere.
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    detect = await reader()
    await nextTick()
    if (!video.value || !open.value) return stop()
    video.value.srcObject = stream
    await video.value.play()
    tick()
  }
  catch (error) {
    const name = (error as { name?: string })?.name
    problem.value = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-camera' : 'failed'
    stop()
  }
  finally {
    starting.value = false
  }
}

function tick() {
  frame = requestAnimationFrame(async () => {
    if (!open.value || !video.value || !detect) return
    let code: string | null = null
    try {
      if (video.value.readyState >= 2) code = await detect(video.value)
    }
    catch {
      code = null
    }
    const now = Date.now()
    if (code && (code !== last.code || now - last.at > REPEAT_MS)) {
      last = { code, at: now }
      emit('scanned', code)
      if (!props.continuous) {
        open.value = false
        return
      }
    }
    else if (code) {
      last.at = now
    }
    tick()
  })
}

function stop() {
  cancelAnimationFrame(frame)
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

watch(open, (now) => {
  if (now) void start()
  else stop()
})
onBeforeUnmount(stop)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('core.scan.title')"
    :description="t('core.scan.description')"
  >
    <UButton
      icon="i-lucide-scan-qr-code"
      color="neutral"
      variant="outline"
      :label="label ?? t('core.scan.button')"
      :disabled="disabled"
    />
    <template #body>
      <div class="space-y-3">
        <UAlert
          v-if="problem"
          color="warning"
          variant="subtle"
          icon="i-lucide-camera-off"
          role="alert"
          :title="t(`core.scan.problem.${problem}`)"
          :description="t(typing ? 'core.scan.problem.type-below' : 'core.scan.problem.type-instead')"
        />
        <div
          v-else
          class="relative overflow-hidden rounded-md bg-black"
        >
          <video
            ref="video"
            class="aspect-square w-full object-cover"
            muted
            playsinline
            :aria-label="t('core.scan.camera')"
          />
          <div
            class="pointer-events-none absolute inset-[15%] rounded-lg border-2 border-white/80"
            aria-hidden="true"
          />
          <p
            v-if="starting"
            class="absolute inset-0 flex items-center justify-center text-sm text-white"
          >
            {{ t('core.scan.starting') }}
          </p>
        </div>
        <UForm
          v-if="typing"
          class="flex items-end gap-2"
          :state="{ typed }"
          @submit="submitTyped"
        >
          <UFormField
            :label="t('core.scan.type-label')"
            class="grow"
          >
            <UInput
              v-model="typed"
              autocomplete="off"
            />
          </UFormField>
          <UButton
            type="submit"
            color="neutral"
            variant="outline"
            :label="t('core.scan.type-submit')"
            :disabled="!typed.trim()"
          />
        </UForm>
        <UAlert
          v-if="status"
          :color="statusColor"
          variant="subtle"
          role="status"
          :title="status"
        />
      </div>
    </template>
  </UModal>
</template>
