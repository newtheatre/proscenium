<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysMoney } from '#shared/utils/bar'
import type { TillBooking, WalkUpOption } from '#shared/utils/sale'
import type { ScannerFailure } from '~/composables/useQrScanner'

// The Tickets pane (F-122 criterion 1): a booking found by camera, reference or name, and a
// walk-up built from tonight's houses here.

interface Performance { id: string, showTitle: string, startsAt: number }

defineProps<{
  lookingUp: boolean
  cameraNote: string | null
  lookupFailure: string | null
  found: TillBooking[]
  ticketLines: TillBooking[]
  tonightsPerformances: Performance[]
  walkUpOptionsFailure: string | null
  walkUpOptions: WalkUpOption[]
  walkUpQty: Record<string, number>
  walkUpGuestIncomplete: boolean
  lookUp: () => Promise<void>
  scanDecoded: (value: string) => Promise<void>
  openCamera: () => void
  fallBackToTyping: (failure: ScannerFailure) => void
  addBooking: (booking: TillBooking) => void
  bumpWalkUp: (typeId: string, by: number) => void
  addWalkUps: () => void
}>()

const lookupTerm = defineModel<string>('lookupTerm', { required: true })
const cameraOpen = defineModel<boolean>('cameraOpen', { required: true })
const walkUpPerformanceId = defineModel<string | undefined>('walkUpPerformanceId')
const walkUpGuestName = defineModel<string>('walkUpGuestName', { required: true })
const walkUpGuestEmail = defineModel<string>('walkUpGuestEmail', { required: true })
</script>

<template>
  <div
    class="space-y-4"
    data-test="tickets-pane"
  >
    <p class="text-xs text-muted">
      Ticket money is taken on the reader: credit cannot pay for a ticket, so choosing one here clears any tab holder already picked.
    </p>

    <NightBlock title="Find a booking">
      <div class="flex flex-wrap gap-2">
        <UInput
          v-model="lookupTerm"
          placeholder="Reference or name"
          autocapitalize="characters"
          class="min-w-0 grow"
          data-test="ticket-lookup"
          @keyup.enter="lookUp"
        />
        <UButton
          class="min-h-12"
          :loading="lookingUp"
          data-test="ticket-lookup-submit"
          @click="lookUp"
        >
          Find
        </UButton>
        <UButton
          v-if="cameraOpen"
          color="neutral"
          variant="subtle"
          icon="i-lucide-camera-off"
          class="min-h-12"
          data-test="ticket-scan-close"
          @click="cameraOpen = false"
        >
          Close the camera
        </UButton>
        <UButton
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-camera"
          class="min-h-12"
          data-test="ticket-scan-camera"
          @click="openCamera"
        >
          Scan
        </UButton>
      </div>
      <p
        v-if="cameraNote"
        class="mt-2 text-sm text-muted"
        data-test="ticket-scan-camera-note"
      >
        {{ cameraNote }}
      </p>
      <QrScanner
        v-if="cameraOpen"
        class="mt-3 w-full"
        @decoded="scanDecoded"
        @unavailable="fallBackToTyping"
      />
      <UAlert
        v-if="lookupFailure"
        class="mt-3"
        color="warning"
        variant="subtle"
        :description="lookupFailure"
        data-test="ticket-lookup-failure"
      />
      <div
        v-for="booking in found"
        :key="booking.id"
        class="mt-3 rounded-lg border border-default p-3"
        :data-test="`found-${booking.id}`"
      >
        <p class="font-mono text-sm tracking-widest">
          {{ booking.reference }}
        </p>
        <p class="text-sm">
          {{ booking.bookerFirstName ?? 'Walk-up' }} · party of {{ booking.partySize }} · {{ booking.showTitle }}
        </p>
        <p
          class="text-sm"
          :class="booking.isTonight ? 'text-muted' : 'text-warning'"
        >
          {{ formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }) }}
          <template v-if="!booking.isTonight">
            · not tonight
          </template>
        </p>
        <p
          v-if="booking.refusal"
          class="mt-2 text-sm text-muted"
          :data-test="`found-refusal-${booking.id}`"
        >
          {{ booking.refusal }}
        </p>
        <UButton
          v-else
          class="mt-2 min-h-12"
          :disabled="ticketLines.some(line => line.id === booking.id)"
          :data-test="`found-add-${booking.id}`"
          @click="addBooking(booking)"
        >
          Add {{ saysMoney(booking.owedPence) }} to the basket
        </UButton>
      </div>
    </NightBlock>

    <NightBlock title="Walk-up">
      <USelect
        v-if="tonightsPerformances.length > 1"
        v-model="walkUpPerformanceId"
        :items="tonightsPerformances.map(one => ({ label: `${one.showTitle} · ${formatLondon(new Date(one.startsAt * 1000), { timeStyle: 'short' })}`, value: one.id }))"
        placeholder="Which performance"
        class="w-full"
        data-test="walk-up-performance"
      />
      <UAlert
        v-if="walkUpOptionsFailure"
        class="mt-2"
        color="warning"
        variant="subtle"
        :description="walkUpOptionsFailure"
      />
      <div
        v-for="option in walkUpOptions"
        :key="option.id"
        class="mt-2 flex items-center justify-between gap-2"
        :data-test="`walk-up-option-${option.id}`"
      >
        <span class="text-sm">{{ option.name }} · {{ saysMoney(option.price) }}</span>
        <div class="flex items-center gap-1">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-minus"
            class="size-12"
            :aria-label="`One fewer ${option.name}`"
            :data-test="`walk-up-minus-${option.id}`"
            @click="bumpWalkUp(option.id, -1)"
          />
          <span
            class="w-6 text-center text-sm"
            :data-test="`walk-up-qty-${option.id}`"
          >{{ walkUpQty[option.id] ?? 0 }}</span>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            class="size-12"
            :aria-label="`One more ${option.name}`"
            :data-test="`walk-up-plus-${option.id}`"
            @click="bumpWalkUp(option.id, 1)"
          />
        </div>
      </div>
      <p
        v-if="walkUpPerformanceId && walkUpOptions.length === 0 && !walkUpOptionsFailure"
        class="mt-2 text-sm text-muted"
      >
        Nothing is on sale for this performance.
      </p>
      <UButton
        v-if="walkUpOptions.length"
        class="mt-3 min-h-12"
        color="neutral"
        variant="subtle"
        :disabled="!Object.values(walkUpQty).some(qty => qty > 0)"
        data-test="walk-up-add"
        @click="addWalkUps"
      >
        Add to the basket
      </UButton>
      <p class="mt-4 text-xs text-muted">
        Their name and email are optional. With them, the booking's QR is emailed; without, the pass on screen is theirs to photograph.
      </p>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <UInput
          v-model="walkUpGuestName"
          placeholder="Name"
          data-test="walk-up-name"
        />
        <UInput
          v-model="walkUpGuestEmail"
          type="email"
          autocapitalize="off"
          placeholder="Email"
          data-test="walk-up-email"
        />
      </div>
      <p
        v-if="walkUpGuestIncomplete"
        class="mt-1 text-xs text-warning"
        data-test="walk-up-guest-incomplete"
      >
        Both a name and an email, or neither.
      </p>
    </NightBlock>
  </div>
</template>
