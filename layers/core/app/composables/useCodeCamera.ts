// Reading QR codes from the device's camera, for CodeScanButton's dialog and for a screen that is a
// scanner, such as the door in live mode. The browser's own barcode reader is used where it knows QR
// codes, and jsQR otherwise, which reads the picture on the device: nothing is sent anywhere. The
// same code is not read twice in a row within a few seconds, so a code held still is one scan.
import type { Ref } from 'vue'

export type CameraProblem = 'insecure' | 'no-camera' | 'denied' | 'failed'

// Not read again within this long, so a code held still is one scan. Interface timing, not policy.
const REPEAT_MS = 3000 // not-policy: how long one code held to the camera counts as one scan
type Detect = (source: HTMLVideoElement) => Promise<string | null>

let canvas: HTMLCanvasElement | null = null
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

/**
 * Runs the camera into `video` while `running` is true, calling `onCode` for each code read. Return
 * `'stop'` from it to stop reading after that code. Says what went wrong, if anything, and whether
 * the camera is still starting.
 */
export function useCodeCamera(video: Ref<HTMLVideoElement | null>, running: Ref<boolean>, onCode: (code: string) => 'stop' | undefined) {
  const problem = ref<CameraProblem | null>(null)
  const starting = ref(false)
  let stream: MediaStream | null = null
  let frame = 0
  let last = { code: '', at: 0 }
  let detect: Detect | null = null

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
      if (!video.value || !running.value) return stop()
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
      if (!running.value || !video.value || !detect) return
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
        if (onCode(code) === 'stop') return
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

  watch(running, (now) => {
    if (now) void start()
    else stop()
  })
  onMounted(() => {
    if (running.value) void start()
  })
  onBeforeUnmount(stop)
  return { problem, starting }
}
