import jsQR from 'jsqr'
import { isRepeatScan } from '#shared/utils/door'

// The camera half of E-129. `BarcodeDetector` where the browser has it, jsQR everywhere else;
// either way one decoded string comes out, deduplicated, and every track is stopped on close.

export type ScannerFailure = 'NO_CAMERA' | 'REFUSED' | 'BROKEN'

// Fast enough to feel instant in a queue, slow enough that a phone is not decoding flat out.
const FRAME_INTERVAL_MS = 180

interface BarcodeDetectorLike { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

export interface QrScanner {
  active: Ref<boolean>
  failure: Ref<ScannerFailure | null>
  torchOn: Ref<boolean>
  torchAvailable: Ref<boolean>
  start: (video: HTMLVideoElement) => Promise<void>
  stop: () => void
  toggleTorch: () => Promise<void>
  decodeFrame: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<string | null>
}

// A refused permission and a device with no camera read differently to a volunteer, so the
// browser's own error name is mapped rather than collapsed into "something went wrong".
function failureOf(error: unknown): ScannerFailure {
  const name = (error as { name?: string }).name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'REFUSED'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'NO_CAMERA'
  return 'BROKEN'
}

export function useQrScanner(onDecode: (value: string) => void): QrScanner {
  const active = ref(false)
  const failure = ref<ScannerFailure | null>(null)
  const torchOn = ref(false)
  const torchAvailable = ref(false)

  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  let detector: BarcodeDetectorLike | null = null
  let canvas: HTMLCanvasElement | null = null
  let last: { value: string, at: number } | null = null

  function frameOf(source: HTMLVideoElement | HTMLCanvasElement): ImageData | null {
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height
    if (width === 0 || height === 0) return null

    canvas ??= document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(source, 0, 0, width, height)
    return context.getImageData(0, 0, width, height)
  }

  async function decodeFrame(source: HTMLVideoElement | HTMLCanvasElement): Promise<string | null> {
    if (detector) {
      const found = await detector.detect(source)
      if (found[0]) return found[0].rawValue
      return null
    }
    const frame = frameOf(source)
    if (!frame) return null
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }

  // One code sits in front of the lens for a second or two, so a repeat inside the window is the
  // same physical scan and is dropped here rather than by the screen (criterion 3).
  function offer(value: string): void {
    const at = Date.now()
    if (isRepeatScan(last, value, at)) return
    last = { value, at }
    onDecode(value)
  }

  async function start(video: HTMLVideoElement): Promise<void> {
    failure.value = null
    if (!navigator.mediaDevices?.getUserMedia) {
      failure.value = 'NO_CAMERA'
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    }
    catch (refused) {
      failure.value = failureOf(refused)
      return
    }

    video.srcObject = stream
    video.setAttribute('playsinline', 'true')
    await video.play().catch(() => undefined)

    if (window.BarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      }
      catch {
        detector = null
      }
    }

    const track = stream.getVideoTracks()[0]
    torchAvailable.value = Boolean(track && 'torch' in (track.getCapabilities?.() ?? {}))

    active.value = true
    timer = setInterval(() => {
      decodeFrame(video).then(value => value && offer(value)).catch(() => undefined)
    }, FRAME_INTERVAL_MS)
  }

  // Every track, not just the first: the light stays on all evening otherwise (criterion 4).
  function stop(): void {
    if (timer) clearInterval(timer)
    timer = undefined
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    detector = null
    active.value = false
    torchOn.value = false
  }

  async function toggleTorch(): Promise<void> {
    const track = stream?.getVideoTracks()[0]
    if (!track || !torchAvailable.value) return
    const wanted = !torchOn.value
    try {
      await track.applyConstraints({ advanced: [{ torch: wanted } as MediaTrackConstraintSet] })
      torchOn.value = wanted
    }
    catch {
      torchAvailable.value = false
    }
  }

  return { active, failure, torchOn, torchAvailable, start, stop, toggleTorch, decodeFrame }
}
