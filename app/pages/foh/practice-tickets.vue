/**
 * The practice ticket sheet: the fixture bookings as QR cards a trainer prints
 * and cuts up before a lesson. Needs no run and no window (docs/14 §5.4).
 */
<script setup lang="ts">
import { encode } from 'uqr'
import { bookingStanding, type BookingPaymentState } from '~~/shared/utils/bookingStanding'
import { TRAINING_BOOKINGS, trainingPerformance } from '~~/shared/utils/trainingScenario'

definePageMeta({
  layout: 'foh',
  middleware: ['foh'],
  title: 'Practice ticket sheet',
})

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

/**
 * The lesson per verdict, keyed by the standing the door will compute, so a
 * card cannot claim an outcome the scanner disagrees with.
 */
const LESSON: Record<BookingPaymentState, { verdict: string, teach: string }> = {
  PAID: {
    verdict: 'Green: paid, all collected',
    teach: 'Admit them. There is nothing left to pay.',
  },
  UNPAID: {
    verdict: 'Amber: unpaid',
    teach: 'Send them to the counter to pay, then admit them. The door never takes money.',
  },
  CANCELLED: {
    verdict: 'Red: cancelled',
    teach: 'Do not admit. Fetch the duty manager and let them sort it out.',
  },
  NO_SHOW: {
    verdict: 'Grey: released',
    teach: 'The seats went back on sale. Fetch the duty manager.',
  },
}

// Two modules of quiet zone plus the card's own white space: the specified
// four would only shrink the printed code.
const QR_BORDER = 2

/** One path rather than a rect per module, which prints without seams. */
function qrPath(text: string) {
  const { size, data } = encode(text, { border: QR_BORDER, ecc: 'M' })
  let path = ''
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (data[row]?.[column]) path += `M${column} ${row}h1v1h-1z`
    }
  }
  return { size, path }
}

/**
 * Everything on a card is derived from the fixture, so a change there reaches
 * the paper rather than leaving it quietly wrong.
 */
const cards = computed(() => TRAINING_BOOKINGS.map((booking) => {
  const standing = bookingStanding(booking)
  const performance = trainingPerformance(booking.performanceId)
  const lesson = LESSON[standing.state]
  const people = `${standing.partySize} ${standing.partySize === 1 ? 'person' : 'people'}`
  const owed = standing.amountOwedPence ? `, ${formatMoney(standing.amountOwedPence)} owed` : ''
  return {
    ref: booking.bookingRef,
    name: booking.customerName,
    showTitle: performance?.showTitle ?? 'A practice performance',
    venueName: performance?.venueName ?? '',
    startsAt: performance?.startsAt ?? null,
    needs: (booking.accessNeeds ?? []).map(need => NEED_LABELS[need] ?? need),
    verdict: `${lesson.verdict}, ${people}${owed}`,
    teach: lesson.teach,
    qr: qrPath(booking.bookingRef),
  }
}))

function print() {
  window.print()
}
</script>

<template>
  <div class="min-h-screen bg-white text-black">
    <div class="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:p-0">
      <header class="mb-6 print:hidden">
        <div class="flex items-baseline justify-between gap-3">
          <h1 class="text-xl font-semibold">
            Practice ticket sheet
          </h1>
          <NuxtLink
            to="/foh"
            class="text-sm underline underline-offset-4"
          >
            Back
          </NuxtLink>
        </div>
        <p class="mt-2 text-sm">
          Five practice tickets for the door sandbox. Print them, cut along the dashed lines and hand
          them out. They work on their own: nobody has to be in a practice run for you to print this.
        </p>
        <p class="mt-2 text-sm">
          The trainee opens <strong>Practise the door</strong> from the Front of House screen and
          scans these. Scanning the same card twice is how you practise a rescan: the verdict must
          not change.
        </p>
        <UButton
          class="mt-4"
          icon="i-lucide-printer"
          label="Print the sheet"
          @click="print"
        />
      </header>

      <!-- Printed once at the top, because a cut-up sheet loses its heading. -->
      <p class="hidden text-[9pt] font-bold leading-tight print:block">
        NOTTINGHAM NEW THEATRE: PRACTICE TICKETS. NOT REAL BOOKINGS. Cut along the dashed lines.
      </p>

      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 print:mt-2 print:grid-cols-2 print:gap-2">
        <article
          v-for="card in cards"
          :key="card.ref"
          class="flex break-inside-avoid flex-col gap-3 rounded-lg border-2 border-dashed border-black p-4 print:min-h-[120mm] print:gap-1 print:rounded-none print:p-3 print:text-[10pt]"
        >
          <div class="border-b-2 border-black pb-2 text-center">
            <p class="text-lg font-black uppercase tracking-wide print:text-[13pt]">
              Practice ticket
            </p>
            <p class="text-xs font-bold uppercase tracking-wide">
              Not a real booking. Not valid for entry.
            </p>
          </div>

          <div class="flex flex-col items-center gap-1">
            <svg
              :viewBox="`0 0 ${card.qr.size} ${card.qr.size}`"
              class="size-40 print:size-[32mm]"
              shape-rendering="crispEdges"
              role="img"
              :aria-label="`QR code reading ${card.ref}`"
            >
              <rect
                width="100%"
                height="100%"
                fill="#ffffff"
              />
              <path
                :d="card.qr.path"
                fill="#000000"
              />
            </svg>
            <p class="font-mono text-2xl font-bold tracking-widest print:text-[17pt]">
              {{ card.ref }}
            </p>
            <p class="text-[8pt] uppercase tracking-wide">
              Type this in if the camera will not read it
            </p>
          </div>

          <div class="text-sm">
            <p class="font-semibold">
              {{ card.name }}
            </p>
            <p>
              {{ card.showTitle }}
            </p>
            <p>
              {{ formatTime(card.startsAt) }} · {{ card.venueName }}
            </p>
          </div>

          <div class="border-t-2 border-black pt-2 text-sm">
            <p class="text-[8pt] font-bold uppercase tracking-wide">
              What the trainee should see
            </p>
            <p class="font-semibold">
              {{ card.verdict }}
            </p>
            <p>{{ card.teach }}</p>
            <p v-if="card.needs.length">
              Access symbols: {{ card.needs.join(', ') }}. Seat them the way the symbols ask, and
              do not discuss it in the queue.
            </p>
          </div>

          <p class="mt-auto text-[8pt] leading-snug">
            Door training sample for the Nottingham New Theatre. This reference exists only in the
            practice sandbox: no real door will admit it.
          </p>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: A4;
    margin: 10mm;
  }
}
</style>
