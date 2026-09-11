<script setup lang="ts">
import { saysPrice } from '#shared/utils/ticket-types'

definePageMeta({ layout: 'console', title: 'Issue passes', middleware: 'console' })

interface PassPrice {
  id: string
  label: string
  price: number
}

interface SellablePassType {
  id: string
  name: string
  description: string | null
  status: string
  maxIssued: number | null
  issuedCount: number
  prices: PassPrice[]
}

interface PendingRequest {
  id: string
  userId: string
  name: string
  createdAt: number
}

const request = useRequestFetch()
const toast = useToast()

const { data: passTypes, refresh: refreshPassTypes, error: passTypesError } = await useAsyncData<SellablePassType[]>(
  'desk-sellable-passes',
  async () => (await request<{ items: SellablePassType[] }>('/api/box-office/desk/passes')).items,
  { default: (): SellablePassType[] => [] },
)

// Shown rather than a bare "Nothing is on sale", which a refused fetch also rendered (#899).
const passTypesFailure = computed(() => (passTypesError.value ? refusalText(passTypesError.value, 'The sellable passes could not be read.') : null))

const passTypeId = ref<string | undefined>(undefined)
watch(passTypes, (value) => {
  if (value.length > 0 && !passTypeId.value) passTypeId.value = value[0]!.id
}, { immediate: true })

const selectedPassType = computed(() => passTypes.value.find(one => one.id === passTypeId.value) ?? null)
const capRemaining = computed(() => {
  const type = selectedPassType.value
  if (!type || type.maxIssued === null) return null
  return Math.max(0, type.maxIssued - type.issuedCount)
})

const requests = ref<PendingRequest[]>([])
async function loadRequests(): Promise<void> {
  if (!passTypeId.value) {
    requests.value = []
    return
  }
  requests.value = (await $fetch<{ items: PendingRequest[] }>(`/api/box-office/desk/passes/${passTypeId.value}/requests`)).items
}
watch(passTypeId, loadRequests, { immediate: true })

const priceId = ref<string | undefined>(undefined)
// Immediate: selectedPassType is already set by the time this registers, since the watcher
// above runs synchronously first, and a price left blank silently zeroes what Issue charges (#940).
watch(selectedPassType, (type) => {
  priceId.value = type?.prices[0]?.id
}, { immediate: true })

const buyerId = ref<string | undefined>(undefined)
const personPicker = useTemplateRef('personPicker')

const requestId = ref<string | undefined>(undefined)

// A person is chosen, never typed (0032): the picker's own preset shows the requester's name
// without a search, since fulfilling a request already knows exactly who they are (#940, #924).
function fulfilRequest(request: PendingRequest): void {
  requestId.value = request.id
  buyerId.value = request.userId
  personPicker.value?.preset({ id: request.userId, name: request.name, email: '' })
}

const duePence = computed(() => selectedPassType.value?.prices.find(one => one.id === priceId.value)?.price ?? 0)

const issuing = ref(false)
const issueFailure = ref<string | null>(null)

async function issue(): Promise<void> {
  if (!passTypeId.value || !priceId.value || !buyerId.value) return
  issuing.value = true
  issueFailure.value = null
  try {
    await $fetch('/api/box-office/desk/passes', {
      method: 'POST',
      body: {
        passTypeId: passTypeId.value,
        passTypePriceId: priceId.value,
        userId: buyerId.value,
        expectedTotalPence: duePence.value,
        requestId: requestId.value,
      },
    })
    toast.add({ title: 'Pass issued', icon: 'i-lucide-check', color: 'success' })
    buyerId.value = undefined
    requestId.value = undefined
    await Promise.all([refreshPassTypes(), loadRequests()])
  }
  catch (error) {
    issueFailure.value = refusalText(error)
  }
  finally {
    issuing.value = false
  }
}
</script>

<template>
  <div
    class="space-y-6"
    data-test="desk-passes-page"
  >
    <UCard>
      <template #header>
        <h1 class="nnt-headline text-lg">
          Issue a pass
        </h1>
      </template>

      <UAlert
        v-if="passTypesFailure"
        color="error"
        variant="subtle"
        :description="passTypesFailure"
        data-test="desk-passes-failure"
      />

      <div
        v-else-if="passTypes.length === 0"
        class="py-6 text-center text-sm text-muted"
      >
        Nothing is on sale.
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <UFormField label="Pass">
          <USelect
            v-model="passTypeId"
            :items="passTypes.map(type => ({ label: type.name, value: type.id }))"
            data-test="desk-pass-type"
          />
        </UFormField>

        <p
          v-if="capRemaining !== null"
          class="text-sm text-muted"
          data-test="desk-pass-cap-remaining"
        >
          {{ capRemaining }} left of {{ selectedPassType?.maxIssued }}
        </p>

        <UFormField
          v-if="selectedPassType"
          label="Price"
        >
          <USelect
            v-model="priceId"
            :items="selectedPassType.prices.map(price => ({ label: `${price.label}: ${saysPrice(price.price)}`, value: price.id }))"
            data-test="desk-pass-price"
          />
        </UFormField>

        <div
          v-if="requests.length > 0"
          class="space-y-1"
        >
          <p class="text-sm font-medium">
            Pending requests
          </p>
          <ul class="space-y-1 text-sm">
            <li
              v-for="request in requests"
              :key="request.id"
              class="flex items-center justify-between"
            >
              <span>{{ request.name }}</span>
              <UButton
                size="xs"
                variant="subtle"
                :data-test="`desk-pass-fulfil-${request.id}`"
                @click="fulfilRequest(request)"
              >
                Choose
              </UButton>
            </li>
          </ul>
        </div>

        <UFormField label="Buyer">
          <PersonPicker
            ref="personPicker"
            v-model="buyerId"
            endpoint="/api/box-office/desk/passes/buyers"
            search-param="q"
            placeholder="Search by name or email"
          />
        </UFormField>

        <UAlert
          v-if="issueFailure"
          color="error"
          variant="subtle"
          :description="issueFailure"
        />

        <p
          class="text-lg font-semibold"
          data-test="desk-pass-due"
        >
          Due now: {{ saysPrice(duePence) }}
        </p>

        <UButton
          :disabled="!buyerId"
          :loading="issuing"
          data-test="desk-pass-issue"
          @click="issue"
        >
          Issue
        </UButton>
      </div>
    </UCard>
  </div>
</template>
