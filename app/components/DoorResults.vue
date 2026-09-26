<script setup lang="ts">
import { doorFailureVerdict, saysDoorParty } from '#shared/utils/door'
import type { DoorAdmission, DoorFoundState, DoorPassCard, DoorTicketFound } from '#shared/utils/door'

// What the door's one field found (issue 1301): tonight's tickets as a first name, a count and
// paid or unpaid, and passes as their card (D-126). Every verdict afterwards is the page's own.
const props = defineProps<{
  performanceId: string
  tickets: DoorTicketFound[]
  passes: DoorPassCard[]
  admittingReference: string | null
}>()
const emit = defineEmits<{ admitTicket: [reference: string], admitted: [result: DoorAdmission] }>()

const ticketBadge: Record<DoorFoundState, { label: string, color: 'success' | 'secondary' | 'warning' }> = {
  PAID: { label: 'Paid', color: 'success' },
  UNPAID: { label: 'Unpaid', color: 'secondary' },
  ADMITTED: { label: 'In', color: 'warning' },
}

const admittingPass = ref<string | null>(null)

async function admitPass(pass: DoorPassCard): Promise<void> {
  admittingPass.value = pass.id
  try {
    const result = await $fetch<DoorAdmission>('/api/tonight/door/passes/scan', {
      method: 'POST',
      body: { reference: pass.reference, performanceId: props.performanceId },
    })
    emit('admitted', { ...result, holderName: pass.holderName })
  }
  catch (refused) {
    emit('admitted', {
      reference: pass.reference,
      verdict: doorFailureVerdict(refusalStatus(refused), refusalText(refused)),
      holderName: pass.holderName,
      partySize: 0,
    })
  }
  finally {
    admittingPass.value = null
  }
}
</script>

<template>
  <div
    class="space-y-3"
    data-test="door-results"
  >
    <div
      v-for="ticket in tickets"
      :key="ticket.reference"
      class="space-y-3 rounded-xl border border-default bg-elevated p-4"
      :data-test="`door-ticket-${ticket.reference}`"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="nnt-headline text-xl">
          {{ saysDoorParty(ticket.firstName, ticket.partySize) }}
        </p>
        <UBadge
          :color="ticketBadge[ticket.state].color"
          variant="subtle"
          size="sm"
        >
          {{ ticketBadge[ticket.state].label }}
        </UBadge>
      </div>

      <p class="font-mono text-sm text-muted">
        {{ ticket.reference }}
      </p>

      <UButton
        v-if="ticket.state === 'PAID'"
        size="xl"
        block
        color="secondary"
        icon="i-lucide-check"
        :loading="admittingReference === ticket.reference"
        class="min-h-12"
        :data-test="`door-ticket-admit-${ticket.reference}`"
        @click="emit('admitTicket', ticket.reference)"
      >
        Admit
      </UButton>
      <p
        v-else
        class="font-semibold"
        :class="ticket.state === 'UNPAID' ? 'text-secondary' : 'text-warning'"
        :data-test="`door-ticket-line-${ticket.reference}`"
      >
        {{ ticket.line }}
      </p>
    </div>

    <div
      v-for="pass in passes"
      :key="pass.id"
      class="space-y-3 rounded-xl border border-default bg-elevated p-4"
      :data-test="`pass-card-${pass.reference}`"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="nnt-headline text-xl">
          {{ pass.holderName }}
        </p>
        <UBadge
          :color="pass.active ? 'success' : 'error'"
          variant="subtle"
          size="sm"
        >
          {{ pass.active ? 'Active' : 'Not active' }}
        </UBadge>
      </div>

      <p class="font-mono text-sm text-muted">
        {{ pass.reference }} · {{ pass.passTypeName }}
      </p>

      <dl class="space-y-1 text-sm">
        <div class="flex justify-between gap-3">
          <dt class="text-muted">
            Covers
          </dt>
          <dd class="text-right">
            {{ pass.covers }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-muted">
            Tonight
          </dt>
          <dd
            class="text-right"
            :class="pass.admittedTonight ? 'text-warning' : 'text-success'"
            :data-test="`pass-tonight-${pass.reference}`"
          >
            {{ pass.tonight }}
          </dd>
        </div>
        <div
          v-if="pass.lastUsed"
          class="flex justify-between gap-3"
        >
          <dt class="text-muted">
            Last used
          </dt>
          <dd class="text-right">
            {{ pass.lastUsed }}
          </dd>
        </div>
      </dl>

      <UAlert
        v-if="pass.refusal"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :description="pass.refusal"
        :data-test="`pass-refusal-${pass.reference}`"
      />

      <!-- The limelight, filled, through the theme's own secondary and never a scale name. A pass
           admits its holder and nobody else, so the label names no count (D-126 criterion 4). -->
      <UButton
        v-else
        size="xl"
        block
        color="secondary"
        icon="i-lucide-check"
        :loading="admittingPass === pass.id"
        class="min-h-12"
        :data-test="`pass-admit-${pass.reference}`"
        @click="admitPass(pass)"
      >
        Admit one
      </UButton>
    </div>
  </div>
</template>
