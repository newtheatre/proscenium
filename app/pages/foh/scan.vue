/**
 * Scan a ticket: camera, then a ref field and a name search in the same view,
 * so nobody backs out to find another way in. Design: docs/11 §2.1.
 */
<script setup lang="ts">
import jsQR from 'jsqr'
import { isStaff } from '~~/shared/utils/abilities'

definePageMeta({
  layout: 'foh',
  middleware: ['foh'],
  title: 'Scan ticket',
})

interface Standing {
  state: 'PAID' | 'UNPAID' | 'CANCELLED' | 'NO_SHOW'
  partySize: number
  amountOwedPence: number
}

interface Match {
  id: string
  bookingRef: string
  status: string
  standing: Standing
  performance: { id: string, startsAt: string, showTitle: string, venueName: string }
  firstName?: string
  customerName?: string
  customerEmail?: string
  tickets?: Array<{ pricePaid: number, refundedAt: string | null, ticketTypeName: string | null }>
  accessNeeds?: string[] | null
}

const NEED_LABELS: Record<string, string> = {
  levelAccess: 'Level access',
  difficultyStanding: 'Difficulty standing',
  difficultyWithCrowds: 'Crowds',
  distance: 'Distance',
  urgentToilet: 'Urgent toilet',
  visualInformation: 'Visual info',
  audibleInformation: 'Audible info',
  miscellaneous: 'Other',
}

const { user } = useUserSession()
const staffView = computed(() => (user.value ? isStaff(user.value) : false))

// One page, two modes (docs/14 §8).
const route = useRoute()
const training = useTrainingMode()
if (route.query.practice) await training.start('door-scan').catch(() => {})
await training.refresh()
const api = (path: string) => `${training.prefix.value}${path}`

const term = ref('')
const results = ref<Match[]>([])
const searching = ref(false)
const problem = ref<string | null>(null)

async function search(q: string) {
  const trimmed = q.trim()
  if (trimmed.length < 2) return
  searching.value = true
  problem.value = null
  try {
    results.value = await $fetch<Match[]>(api('/api/foh/lookup'), { query: { q: trimmed } })
    if (!results.value.length) {
      problem.value = training.active.value
        ? `Nothing matching "${trimmed}" in the practice bookings.`
        : `Nothing matching "${trimmed}" on tonight's performances.`
    }
  }
  catch {
    problem.value = 'That lookup failed. Try again, or use the booking reference.'
  }
  finally {
    searching.value = false
  }
}

// ── The camera ───────────────────────────────────────────────────

const video = useTemplateRef<HTMLVideoElement>('video')
const scanning = ref(false)
const cameraProblem = ref<string | null>(null)
let stream: MediaStream | null = null
let frame: number | null = null

/** Accepts a whole `/t/<REF>` URL or a bare reference; the query is ignored. */
function refFrom(text: string): string | null {
  const url = text.match(/\/t\/([A-Za-z0-9]{6})\b/)
  if (url?.[1]) return url[1].toUpperCase()
  const bare = text.trim().match(/^[A-Za-z0-9]{6}$/)
  return bare ? bare[0].toUpperCase() : null
}

async function found(text: string) {
  const ref = refFrom(text)
  if (!ref) return
  stop()
  term.value = ref
  await search(ref)
}

async function start() {
  cameraProblem.value = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  }
  catch {
    cameraProblem.value = 'No camera available. Type the reference instead.'
    return
  }
  scanning.value = true
  await nextTick()
  if (!video.value) return
  video.value.srcObject = stream
  await video.value.play()

  // BarcodeDetector where it exists, jsQR everywhere else: iOS Safari has no
  // detector, and door staff are on their own phones.
  const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
  const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  const tick = async () => {
    if (!scanning.value || !video.value) return
    try {
      if (detector) {
        const [hit] = await detector.detect(video.value)
        if (hit) return found(hit.rawValue)
      }
      else if (context && video.value.videoWidth) {
        canvas.width = video.value.videoWidth
        canvas.height = video.value.videoHeight
        context.drawImage(video.value, 0, 0)
        const image = context.getImageData(0, 0, canvas.width, canvas.height)
        const hit = jsQR(image.data, image.width, image.height)
        if (hit?.data) return found(hit.data)
      }
    }
    catch {
      // A dropped frame is not worth stopping the scan for.
    }
    frame = requestAnimationFrame(() => {
      void tick()
    })
  }
  void tick()
}

function stop() {
  scanning.value = false
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  stream?.getTracks().forEach(track => track.stop())
  stream = null
}

onBeforeUnmount(stop)

function verdictClass(standing: Standing) {
  if (standing.state === 'PAID') return 'bg-emerald-600 text-white'
  if (standing.state === 'UNPAID') return 'bg-amber-500 text-neutral-950'
  return 'bg-neutral-700 text-white'
}

function verdictText(standing: Standing) {
  if (standing.state === 'PAID') return 'PAID: all collected'
  if (standing.state === 'UNPAID') return 'UNPAID: send to the bar to pay'
  if (standing.state === 'CANCELLED') return 'CANCELLED: do not admit'
  return 'NO SHOW: released'
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Scan ticket
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <div
        v-if="scanning"
        class="mb-4 overflow-hidden rounded-xl border border-neutral-800"
      >
        <video
          ref="video"
          class="w-full"
          playsinline
          muted
        />
        <button
          type="button"
          class="w-full bg-neutral-800 py-3 text-sm"
          @click="stop"
        >
          Stop the camera
        </button>
      </div>
      <UButton
        v-else
        size="xl"
        block
        icon="i-lucide-scan-line"
        label="Scan a QR code"
        class="mb-4"
        @click="start"
      />
      <p
        v-if="cameraProblem"
        class="mb-4 text-sm text-amber-400"
      >
        {{ cameraProblem }}
      </p>

      <form
        class="mb-5 flex gap-2"
        @submit.prevent="search(term)"
      >
        <UInput
          v-model="term"
          placeholder="Reference, or a name"
          size="lg"
          class="flex-1"
          autocapitalize="characters"
        />
        <UButton
          type="submit"
          size="lg"
          :loading="searching"
          label="Find"
        />
      </form>

      <p
        v-if="problem"
        class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-300"
      >
        {{ problem }}
      </p>

      <div
        v-for="match in results"
        :key="match.id"
        class="mb-4 overflow-hidden rounded-xl border border-neutral-800"
      >
        <div
          class="p-5 text-center"
          :class="verdictClass(match.standing)"
        >
          <p class="text-2xl font-bold tracking-tight">
            {{ verdictText(match.standing) }}
          </p>
          <p class="mt-1 text-lg">
            {{ match.standing.partySize }}
            {{ match.standing.partySize === 1 ? 'person' : 'people' }}
          </p>
        </div>

        <div class="space-y-1 bg-neutral-900 p-4 text-sm">
          <p class="font-mono text-base tracking-widest">
            {{ match.bookingRef }}
          </p>
          <p class="text-neutral-300">
            {{ match.firstName ?? match.customerName }}
          </p>
          <p class="text-neutral-400">
            {{ match.performance.showTitle }} · {{ formatTime(match.performance.startsAt) }} ·
            {{ match.performance.venueName }}
          </p>

          <!-- Only where the §2.5 rule admits it; absent otherwise. -->
          <div
            v-if="match.accessNeeds?.length"
            class="mt-2 flex flex-wrap gap-1"
          >
            <span
              v-for="need in match.accessNeeds"
              :key="need"
              class="rounded-full bg-violet-900/70 px-2 py-0.5 text-xs text-violet-100"
            >
              {{ NEED_LABELS[need] ?? need }}
            </span>
          </div>

          <!-- Prices only where the role allows it; the door gets none. -->
          <div
            v-if="staffView && match.tickets?.length"
            class="mt-3 border-t border-neutral-800 pt-3"
          >
            <p
              v-for="(ticket, index) in match.tickets"
              :key="index"
              class="flex justify-between text-neutral-300"
            >
              <span>
                {{ ticket.ticketTypeName ?? 'Ticket' }}
                <span
                  v-if="ticket.refundedAt"
                  class="text-neutral-500"
                >(refunded)</span>
              </span>
              <span>{{ formatMoney(ticket.pricePaid) }}</span>
            </p>
            <p
              v-if="match.standing.amountOwedPence"
              class="mt-2 flex justify-between font-semibold"
            >
              <span>Owed</span>
              <span>{{ formatMoney(match.standing.amountOwedPence) }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
