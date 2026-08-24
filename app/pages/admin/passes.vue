<!--
Admin: pass products and issued passes. Selling and admitting happen at the
box office, not here.
-->
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Passes',
})

interface PassTypePrice {
  id: string
  label: string
  price: number
  active: boolean
}

interface PassType {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'DRAFT' | 'ON_SALE' | 'CLOSED'
  seasonName: string | null
  validFrom: string
  validTo: string
  maxIssued: number | null
  transferable: boolean
  prices: PassTypePrice[]
  showCount: number
  issuedCount: number
}

interface IssuedPass {
  id: string
  reference: string
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED'
  pricePaid: number
  issuedAt: string
  passTypeName: string
  holderName: string
  holderEmail: string
}

const toast = useToast()
const confirm = useConfirm()

// ── Pass products ─────────────────────────────────────────────────────────
interface PassRequestRow {
  id: string
  status: string
  quotedPence: number | null
  note: string | null
  requestedAt: string
  passTypeId: string
  passTypeName: string
  requesterName: string | null
  requesterEmail: string | null
}

const requestFetch = useRequestFetch()
const { data: passTypes, status: typesStatus, error: typesError, refresh: refreshTypes } = await useAsyncData(
  'admin-pass-types', () => requestFetch<PassType[]>('/api/pass-types'), { default: () => [] })

const statusColour: Record<PassType['status'], 'neutral' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  ON_SALE: 'success',
  CLOSED: 'warning',
}

const createOpen = ref(false)

// Which pass type is mid-save, so only its own button spins.
const statusSaving = ref<string | null>(null)

async function setPassTypeStatus(passType: PassType, status: PassType['status']) {
  if (statusSaving.value) return
  statusSaving.value = passType.id
  try {
    await $fetch(`/api/pass-types/${passType.id}`, { method: 'PUT', body: { status } })
    toast.add({
      title: status === 'ON_SALE' ? `${passType.name} is on sale` : `${passType.name} closed`,
      icon: 'i-lucide-check-circle',
      color: 'success',
    })
    await refreshTypes()
  }
  catch (error: unknown) {
    // The server refuses ON_SALE for a product covering no shows and says why,
    // so surface that rather than a generic failure.
    toast.add({
      title: 'Could not update this pass product',
      description: getErrorMessage(error, 'Please try again'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
  finally {
    statusSaving.value = null
  }
}

// ── Issued passes ─────────────────────────────────────────────────────────
const search = ref('')
const page = ref(1)
const limit = 25

const debouncedSearch = useDebouncedRef(search, {
  onSettle: () => { page.value = 1 },
})

// Searching and paging re-run this on the client, which does not suspend the
// page, so the table stays interactive while it refetches.
const { data: issued, status: issuedStatus, error: issuedError, refresh: refreshIssued } = await useAsyncData(
  'admin-passes',
  () => requestFetch<{ rows: IssuedPass[], total: number }>('/api/passes', {
    query: { q: debouncedSearch.value || undefined, page: page.value, limit },
  }),
  { watch: [debouncedSearch, page], default: () => ({ rows: [], total: 0 }) },
)

const pageCount = computed(() => Math.max(1, Math.ceil((issued.value?.total ?? 0) / limit)))

async function cancelPass(pass: IssuedPass) {
  const ok = await confirm({
    title: `Cancel pass ${pass.reference}?`,
    description: `${pass.holderName} will no longer be able to use it. Admissions already redeemed are kept.`,
    confirmLabel: 'Cancel pass',
    confirmColor: 'error',
    icon: 'i-lucide-x-circle',
  })
  if (!ok) return

  try {
    await $fetch(`/api/passes/${pass.id}`, { method: 'PUT', body: { status: 'CANCELLED' } })
    toast.add({ title: 'Pass cancelled', icon: 'i-lucide-check-circle', color: 'success' })
    await Promise.all([refreshIssued(), refreshTypes()])
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not cancel the pass',
      description: getErrorMessage(error, 'Please try again'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
}

/**
 * People who asked for a pass online. Fulfilling one issues the pass; nothing
 * exists until then, and payment is taken in person (ADR-0028).
 */
const { data: requestData, refresh: refreshRequests } = await useAsyncData('pass-requests', () =>
  requestFetch<Paginated<PassRequestRow>>('/api/pass-requests', { query: { status: 'PENDING', limit: 50 } }))

const passRequests = computed(() => requestData.value?.rows ?? [])
const decidingRequest = ref<string | null>(null)

async function fulfilRequest(row: PassRequestRow) {
  const type = passTypes.value.find(t => t.id === row.passTypeId)
  const priceId = type?.prices.find(p => p.active)?.id
  if (!priceId) {
    toast.add({ title: 'That pass has no active price', color: 'error' })
    return
  }
  decidingRequest.value = row.id
  try {
    const result = await requestFetch<{ reference: string | null }>(`/api/pass-requests/${row.id}/fulfil`, {
      method: 'POST',
      body: { passTypePriceId: priceId },
    })
    toast.add({ title: `Issued ${result.reference ?? 'the pass'}`, icon: 'i-lucide-check', color: 'success' })
    await Promise.all([refreshRequests(), refreshIssued()])
  }
  catch (error) {
    toast.add({ title: 'Not issued', description: (error as { data?: { statusMessage?: string } }).data?.statusMessage, color: 'error' })
  }
  finally {
    decidingRequest.value = null
  }
}

async function declineRequest(row: PassRequestRow) {
  decidingRequest.value = row.id
  try {
    await requestFetch(`/api/pass-requests/${row.id}/decline`, { method: 'POST' })
    await refreshRequests()
  }
  catch (error) {
    toast.add({ title: 'Not declined', description: (error as { data?: { statusMessage?: string } }).data?.statusMessage, color: 'error' })
  }
  finally {
    decidingRequest.value = null
  }
}
</script>

<template>
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          Season and festival passes. Sell and admit from the box office.
        </p>
      </template>
      <template #right>
        <UButton
          label="New pass type"
          icon="i-lucide-plus"
          @click="() => { createOpen = true }"
        />
      </template>
    </AdminTableToolbar>

    <section
      v-if="passRequests.length"
      class="space-y-3"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
        Waiting to be paid for
      </h2>
      <UCard
        v-for="row in passRequests"
        :key="row.id"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-medium">
              {{ row.requesterName || 'Someone' }}
              <span class="text-muted">&middot; {{ row.requesterEmail }}</span>
            </p>
            <p class="text-sm">
              {{ row.passTypeName }}
              <span
                v-if="row.quotedPence !== null"
                class="text-muted"
              >
                &middot; quoted {{ formatMoney(row.quotedPence) }}
              </span>
            </p>
            <p
              v-if="row.note"
              class="mt-1 text-sm text-muted"
            >
              {{ row.note }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              size="sm"
              :loading="decidingRequest === row.id"
              label="Paid: issue it"
              @click="fulfilRequest(row)"
            />
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              :loading="decidingRequest === row.id"
              label="Decline"
              @click="declineRequest(row)"
            />
          </div>
        </div>
      </UCard>
    </section>

    <!-- Pass products -->
    <section class="space-y-3">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
        Pass types
      </h2>

      <AdminFetchError
        v-if="typesError"
        :error="typesError"
        title="Could not load pass types"
        :on-retry="refreshTypes"
      />

      <div
        v-if="typesStatus === 'pending'"
        class="space-y-2"
      >
        <USkeleton
          v-for="i in 2"
          :key="i"
          class="h-24 w-full"
        />
      </div>

      <UEmpty
        v-else-if="passTypes.length === 0"
        icon="i-lucide-ticket"
        title="No pass types yet"
        description="Create one to start selling season or festival passes."
      />

      <div
        v-else
        class="space-y-3"
      >
        <UCard
          v-for="pt in passTypes"
          :key="pt.id"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-highlighted">
                  {{ pt.name }}
                </h3>
                <UBadge
                  :label="pt.status"
                  :color="statusColour[pt.status]"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-if="pt.seasonName"
                  :label="pt.seasonName"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <p
                v-if="pt.description"
                class="text-sm text-muted"
              >
                {{ pt.description }}
              </p>
              <p class="text-sm text-muted">
                Valid {{ formatDate(pt.validFrom) }} – {{ formatDate(pt.validTo) }}
                · covers {{ pt.showCount }} show{{ pt.showCount === 1 ? '' : 's' }}
              </p>
              <div class="flex flex-wrap gap-1.5 pt-1">
                <UBadge
                  v-for="price in pt.prices"
                  :key="price.id"
                  :label="`${price.label} ${formatMoney(price.price)}`"
                  :color="price.active ? 'primary' : 'neutral'"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </div>

            <div class="text-right shrink-0 space-y-2">
              <div>
                <div class="text-2xl font-semibold tabular-nums text-highlighted">
                  {{ pt.issuedCount }}
                </div>
                <div class="text-xs text-muted">
                  issued{{ pt.maxIssued ? ` / ${pt.maxIssued}` : '' }}
                </div>
              </div>

              <!--
              Without this a pass product could only ever be DRAFT, and the box office's
              Sell tab was permanently empty.
              -->
              <UButton
                v-if="pt.status !== 'ON_SALE'"
                :loading="statusSaving === pt.id"
                label="Put on sale"
                icon="i-lucide-badge-check"
                color="primary"
                variant="soft"
                size="xs"
                @click="setPassTypeStatus(pt, 'ON_SALE')"
              />
              <UButton
                v-else
                :loading="statusSaving === pt.id"
                label="Close sales"
                icon="i-lucide-ban"
                color="neutral"
                variant="soft"
                size="xs"
                @click="setPassTypeStatus(pt, 'CLOSED')"
              />
              <!-- Pass pressure: passes issued against seats available is the
                   number a human can act on before a popular night. -->
              <div
                v-if="pt.maxIssued && pt.issuedCount >= pt.maxIssued"
                class="text-xs text-error mt-1"
              >
                Sold out
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </section>

    <!-- Issued passes -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
          Issued passes
        </h2>
        <UInput
          v-model="search"
          placeholder="Reference, name or email"
          icon="i-lucide-search"
          class="w-72"
        />
      </div>

      <AdminFetchError
        v-if="issuedError"
        :error="issuedError"
        title="Could not load issued passes"
        :on-retry="refreshIssued"
      />

      <div
        v-if="issuedStatus === 'pending'"
        class="space-y-2"
      >
        <USkeleton
          v-for="i in 4"
          :key="i"
          class="h-12 w-full"
        />
      </div>

      <UEmpty
        v-else-if="issued.rows.length === 0"
        icon="i-lucide-search-x"
        :title="search ? 'No passes match that search' : 'No passes issued yet'"
        :description="search ? 'Try a reference, holder name or email.' : 'Sell one from the box office.'"
      />

      <div
        v-else
        class="space-y-1"
      >
        <div
          v-for="pass in issued.rows"
          :key="pass.id"
          class="flex items-center gap-3 rounded-lg border border-default px-3 py-2.5"
        >
          <span class="font-mono font-semibold tracking-wider text-primary shrink-0">
            {{ pass.reference }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ pass.holderName }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ pass.holderEmail }} · {{ pass.passTypeName }}
            </p>
          </div>
          <span class="text-sm tabular-nums text-muted shrink-0">
            {{ formatMoney(pass.pricePaid) }}
          </span>
          <UBadge
            :label="pass.status"
            :color="pass.status === 'ACTIVE' ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
            class="shrink-0"
          />
          <UButton
            v-if="pass.status === 'ACTIVE'"
            icon="i-lucide-x-circle"
            color="error"
            variant="ghost"
            size="xs"
            :aria-label="`Cancel pass ${pass.reference}`"
            @click="cancelPass(pass)"
          />
        </div>

        <AdminTablePagination
          v-if="pageCount > 1"
          v-model:page="page"
          :total="issued.total"
          :limit="limit"
          label="pass"
          label-plural="passes"
          :suffix="debouncedSearch ? 'matching' : undefined"
        />
      </div>
    </section>

    <PassTypeCreateModal
      v-model:open="createOpen"
      @created="refreshTypes"
    />
  </AdminPage>
</template>
