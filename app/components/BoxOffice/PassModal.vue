<!--
Box office: passes at the door. Looking a holder up and selling a new pass
sit together because that is how the desk works.

Admitting creates an ordinary £0 ticket, so the holder appears on the door
list like any other customer (ADR-0002). The server decides whether a pass
is valid; this only renders the reason it gives back.
-->
<script setup lang="ts">
interface RedeemCheck {
  ok: boolean
  reason?: string
  message?: string
}

interface PassRow {
  id: string
  reference: string
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED'
  passTypeName: string
  holderName: string
  holderEmail: string
  validFrom: string
  validTo: string
  redeemable?: RedeemCheck
}

interface PassTypePrice { id: string, label: string, price: number, active: boolean }
interface PassTypeOption {
  id: string
  name: string
  status: 'DRAFT' | 'ON_SALE' | 'CLOSED'
  prices: PassTypePrice[]
}

const props = defineProps<{
  open: boolean
  performanceId: string | undefined
  performanceLabel: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'admitted': []
}>()

const modelOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

const toast = useToast()
const tab = ref<'admit' | 'sell'>('admit')

/* ── Admit ────────────────────────────────────────────────────────────── */
const search = ref('')
const searching = ref(false)
const results = ref<PassRow[]>([])
const admitting = ref<string | null>(null)

async function lookup() {
  const q = search.value.trim()
  if (!q) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const res = await $fetch<{ rows: PassRow[] }>('/api/passes', {
      query: { q, status: 'ACTIVE', performanceId: props.performanceId, limit: 10 },
    })
    results.value = res.rows
  }
  catch (error: unknown) {
    toast.add({
      title: 'Lookup failed',
      description: getErrorMessage(error, 'Could not search passes'),
      color: 'error',
      icon: 'i-lucide-x-circle',
    })
  }
  finally {
    searching.value = false
  }
}

async function admit(pass: PassRow, override = false) {
  if (!props.performanceId) return
  admitting.value = pass.id
  try {
    await $fetch(`/api/passes/${pass.id}/redeem`, {
      method: 'POST',
      body: { performanceId: props.performanceId, override },
    })
    toast.add({
      title: `${pass.holderName} admitted`,
      description: `Pass ${pass.reference}`,
      icon: 'i-lucide-check-circle',
      color: 'success',
    })
    emit('admitted')
    await lookup()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not admit',
      description: getErrorMessage(error, 'The pass could not be used for this performance'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    admitting.value = null
  }
}

/* ── Sell ─────────────────────────────────────────────────────────────── */
const { data: passTypes } = useFetch<PassTypeOption[]>('/api/pass-types', {
  lazy: true,
  default: () => [],
})

const onSaleTypes = computed(() => (passTypes.value ?? []).filter(t => t.status === 'ON_SALE'))

const sellTypeId = ref<string | undefined>()
const sellPriceId = ref<string | undefined>()
const buyerName = ref('')
const buyerEmail = ref('')
const selling = ref(false)

/**
 * Clear everything when the modal opens. These refs live for the lifetime of
 * the page and only a successful sale reset them, so the next person at the
 * door saw the previous holder's details still filled in.
 */
watch(modelOpen, (isOpen) => {
  if (!isOpen) return
  tab.value = 'admit'
  search.value = ''
  results.value = []
  admitting.value = null
  sellTypeId.value = undefined
  sellPriceId.value = undefined
  buyerName.value = ''
  buyerEmail.value = ''
})

const selectedType = computed(() => onSaleTypes.value.find(t => t.id === sellTypeId.value))
const priceOptions = computed(() =>
  (selectedType.value?.prices ?? []).filter(p => p.active)
    .map(p => ({ label: `${p.label} — £${(p.price / 100).toFixed(2)}`, value: p.id })),
)

watch(sellTypeId, () => {
  sellPriceId.value = undefined
})

const canSell = computed(() =>
  !!sellTypeId.value && !!sellPriceId.value && !!buyerName.value.trim() && !!buyerEmail.value.trim(),
)

async function sell() {
  if (!canSell.value) return
  selling.value = true
  try {
    const created = await $fetch<{ reference: string }>('/api/passes', {
      method: 'POST',
      body: {
        passTypeId: sellTypeId.value,
        passTypePriceId: sellPriceId.value,
        name: buyerName.value.trim(),
        email: buyerEmail.value.trim(),
      },
    })
    toast.add({
      title: 'Pass sold',
      description: `Reference ${created.reference} — take payment as usual.`,
      icon: 'i-lucide-check-circle',
      color: 'success',
    })
    buyerName.value = ''
    buyerEmail.value = ''
    sellPriceId.value = undefined
    // Straight to admitting: usually they want to come in tonight.
    tab.value = 'admit'
    search.value = created.reference
    await lookup()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not sell the pass',
      description: getErrorMessage(error, 'Please try again'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    selling.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="modelOpen"
    title="Passes"
    :description="performanceLabel"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex gap-1 rounded-lg bg-elevated p-1">
          <UButton
            label="Admit"
            :variant="tab === 'admit' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            class="flex-1 justify-center"
            :aria-pressed="tab === 'admit'"
            @click="tab = 'admit'"
          />
          <UButton
            label="Sell a pass"
            :variant="tab === 'sell' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            class="flex-1 justify-center"
            :aria-pressed="tab === 'sell'"
            @click="tab = 'sell'"
          />
        </div>

        <!-- Admit -->
        <div
          v-if="tab === 'admit'"
          class="space-y-3"
        >
          <UInput
            v-model="search"
            placeholder="Pass reference, name or email"
            icon="i-lucide-search"
            :loading="searching"
            class="w-full"
            autofocus
            @keyup.enter="lookup"
          />

          <UEmpty
            v-if="results.length === 0 && !searching"
            icon="i-lucide-credit-card"
            title="Search for a pass"
            description="By reference, holder name or email."
          />

          <div
            v-for="pass in results"
            :key="pass.id"
            class="rounded-lg border border-default p-3 space-y-2"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-highlighted truncate">
                  {{ pass.holderName }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ pass.holderEmail }} · {{ pass.passTypeName }}
                </p>
              </div>
              <span class="font-mono font-semibold tracking-wider text-primary shrink-0">
                {{ pass.reference }}
              </span>
            </div>

            <!-- The server decides; this only shows the reason it gave. -->
            <UAlert
              v-if="pass.redeemable && !pass.redeemable.ok"
              :title="pass.redeemable.message ?? 'This pass cannot be used tonight'"
              icon="i-lucide-triangle-alert"
              color="warning"
              variant="subtle"
            />

            <div class="flex justify-end gap-2">
              <UButton
                v-if="pass.redeemable && !pass.redeemable.ok && pass.redeemable.reason === 'PERFORMANCE_NOT_ON_SALE'"
                label="Admit anyway"
                icon="i-lucide-shield-alert"
                color="warning"
                variant="outline"
                size="sm"
                :loading="admitting === pass.id"
                @click="admit(pass, true)"
              />
              <UButton
                label="Admit"
                icon="i-lucide-door-open"
                size="sm"
                :disabled="!performanceId || (pass.redeemable && !pass.redeemable.ok)"
                :loading="admitting === pass.id"
                @click="admit(pass)"
              />
            </div>
          </div>
        </div>

        <!-- Sell -->
        <div
          v-else
          class="space-y-3"
        >
          <UEmpty
            v-if="onSaleTypes.length === 0"
            icon="i-lucide-ticket"
            title="No passes on sale"
            description="A pass type must be set to ON_SALE in the admin area before it can be sold."
          />

          <template v-else>
            <UFormField
              label="Pass"
              required
            >
              <USelectMenu
                v-model="sellTypeId"
                :items="onSaleTypes.map(t => ({ label: t.name, value: t.id }))"
                value-key="value"
                placeholder="Choose a pass"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Price"
              required
            >
              <USelectMenu
                v-model="sellPriceId"
                :items="priceOptions"
                value-key="value"
                :disabled="!sellTypeId"
                placeholder="Choose a price"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Customer name"
              required
            >
              <UInput
                v-model="buyerName"
                placeholder="Full name"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Email address"
              required
            >
              <UInput
                v-model="buyerEmail"
                type="email"
                placeholder="customer@example.com"
                class="w-full"
              />
              <template #help>
                A pass belongs to a person — this is how they are found at the
                door and how renewals reach them.
              </template>
            </UFormField>

            <div class="flex justify-end">
              <UButton
                label="Sell pass"
                icon="i-lucide-check"
                :loading="selling"
                :disabled="!canSell"
                @click="sell"
              />
            </div>
          </template>
        </div>
      </div>
    </template>
  </UModal>
</template>
