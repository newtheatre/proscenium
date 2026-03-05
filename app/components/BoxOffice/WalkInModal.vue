<!--
  Box Office: Walk-in / On-the-door Reservation

  Creates an on-the-door reservation for a customer who hasn't pre-booked.
  After creation, emits `created` so the parent can immediately open
  the CollectModal to process payment in one flow.

  The server resolves the user by email (finds existing or creates a shadow
  account), and resolves effective ticket prices through show/performance
  overrides — so the client only needs to collect name, email, and quantities.
-->
<script setup lang="ts">
interface TicketType {
  id: string
  name: string
  description: string | null
  effectivePrice: number
  active: boolean
}

const props = defineProps<{
  performanceId: string | undefined
  performanceLabel: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [reservationId: string, bookingRef: string]
}>()

const modelOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

const toast = useToast()

// ── Ticket types ──────────────────────────────────────────────────────────────

const { data: ticketTypes } = useFetch<TicketType[]>(
  () => props.performanceId
    ? `/api/bookings/available-ticket-types?performanceId=${props.performanceId}`
    : null,
  {
    key: 'walk-in-ticket-types',
    lazy: true,
    watch: [() => props.performanceId],
  },
)

const showAllTypes = ref(false)

const defaultTypes = computed(() =>
  (ticketTypes.value ?? []).filter(t => t.active),
)

const additionalTypes = computed(() =>
  (ticketTypes.value ?? []).filter(t => !t.active),
)

const activeTypes = computed(() =>
  showAllTypes.value ? ticketTypes.value ?? [] : defaultTypes.value,
)

// Quantities keyed by ticket type ID
const quantities = ref(new Map<string, number>())

function getQty(id: string): number {
  return quantities.value.get(id) ?? 0
}

function setQty(id: string, val: number) {
  const next = new Map(quantities.value)
  next.set(id, Math.max(0, val))
  quantities.value = next
}

const totalCount = computed(() => {
  let n = 0
  for (const qty of quantities.value.values()) n += qty
  return n
})

const totalPrice = computed(() => {
  let p = 0
  for (const type of ticketTypes.value ?? []) {
    p += getQty(type.id) * type.effectivePrice
  }
  return p
})

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

// ── Customer details ──────────────────────────────────────────────────────────

const email = ref('')
const name = ref('')
const lookingUp = ref(false)
const existingUserId = ref<string | null>(null)
const nameFromLookup = ref(false)

async function lookupEmail() {
  const e = email.value.trim()
  if (!e || !e.includes('@')) return

  lookingUp.value = true
  existingUserId.value = null
  nameFromLookup.value = false

  try {
    const users = await $fetch<Array<{ id: string, name: string, email: string }>>('/api/users')
    const match = users.find(u => u.email.toLowerCase() === e.toLowerCase())
    if (match) {
      existingUserId.value = match.id
      name.value = match.name
      nameFromLookup.value = true
    }
  }
  catch {
    // Silently fail — staff can still type a name manually
  }
  finally {
    lookingUp.value = false
  }
}

// Reset form when modal opens
watch(modelOpen, (v) => {
  if (v) {
    email.value = ''
    name.value = ''
    nameFromLookup.value = false
    existingUserId.value = null
    quantities.value = new Map()
    showAllTypes.value = false
  }
})

// ── Create reservation ────────────────────────────────────────────────────────

const submitting = ref(false)

const canSubmit = computed(() =>
  !!props.performanceId
  && totalCount.value > 0
  && !!email.value.trim()
  && !!name.value.trim(),
)

async function submit() {
  if (!canSubmit.value || !props.performanceId) return

  submitting.value = true
  try {
    const tickets = Array.from(quantities.value.entries())
      .filter(([, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))

    const body: Record<string, unknown> = {
      performanceId: props.performanceId,
      tickets,
    }

    // If we found an existing user, pass userId; otherwise pass name+email
    // and the server will find-or-create the account
    if (existingUserId.value) {
      body.userId = existingUserId.value
    }
    else {
      body.name = name.value.trim()
      body.email = email.value.trim()
    }

    const res = await $fetch<{ id: string, bookingRef: string }>('/api/reservations', {
      method: 'POST',
      body,
    })

    modelOpen.value = false
    emit('created', res.id, res.bookingRef)
  }
  catch (error: unknown) {
    toast.add({
      title: 'Failed to create reservation',
      description: getErrorMessage(error, 'Could not create the walk-in reservation'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="modelOpen"
    :title="`Walk-in — ${performanceLabel}`"
    description="Create an on-the-door reservation. You'll be taken straight to collection after."
  >
    <template #body>
      <div class="space-y-6">
        <!-- Customer details -->
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">
            Customer
          </p>

          <UFormField
            label="Email address"
            required
          >
            <UInput
              v-model="email"
              type="email"
              placeholder="customer@example.com"
              :loading="lookingUp"
              class="w-full"
              @blur="lookupEmail"
            />
          </UFormField>

          <UFormField
            label="Customer name"
            required
          >
            <UInput
              v-model="name"
              placeholder="Full name"
              class="w-full"
              :readonly="nameFromLookup"
              :ui="nameFromLookup ? { base: 'opacity-60' } : {}"
            />
            <template
              v-if="nameFromLookup"
              #help
            >
              <span class="text-success text-xs inline-flex items-center gap-1">
                <UIcon
                  name="i-lucide-circle-check"
                  class="size-3"
                />
                Existing account found
              </span>
            </template>
          </UFormField>
        </div>

        <!-- Ticket selection -->
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">
            Tickets
          </p>

          <div class="space-y-1.5">
            <div
              v-for="type in activeTypes"
              :key="type.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-default"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium leading-tight text-highlighted">
                  {{ type.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ formatPrice(type.effectivePrice) }}
                </p>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <UButton
                  icon="i-lucide-minus"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="getQty(type.id) === 0"
                  @click="setQty(type.id, getQty(type.id) - 1)"
                />
                <span class="w-6 text-center tabular-nums text-sm font-medium">
                  {{ getQty(type.id) }}
                </span>
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  @click="setQty(type.id, getQty(type.id) + 1)"
                />
              </div>

              <div class="w-14 text-right tabular-nums text-sm shrink-0">
                <span :class="getQty(type.id) > 0 ? 'text-highlighted font-medium' : 'text-muted'">
                  {{ formatPrice(getQty(type.id) * type.effectivePrice) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Show all toggle -->
          <UButton
            v-if="additionalTypes.length > 0"
            :label="showAllTypes ? 'Show fewer ticket types' : `Show all ticket types (${additionalTypes.length} more)`"
            :icon="showAllTypes ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            size="xs"
            block
            @click="showAllTypes = !showAllTypes"
          />

          <!-- Running total -->
          <div
            class="flex justify-between items-baseline border-t border-default pt-3"
            :class="totalCount === 0 ? 'opacity-40' : ''"
          >
            <span class="text-sm text-muted">
              {{ totalCount }} {{ totalCount === 1 ? 'ticket' : 'tickets' }}
            </span>
            <span class="text-xl font-semibold text-highlighted tabular-nums">
              {{ formatPrice(totalPrice) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="submitting"
          @click="modelOpen = false"
        />
        <UButton
          label="Create & collect"
          icon="i-lucide-check"
          color="success"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
