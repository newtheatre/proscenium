<!--
  Admin: Passes

  Two things live here:
   - Pass products (pass types) — the thing you sell: name, validity window,
     price variants, and the list of shows it covers.
   - Issued passes — searchable, so a holder can be found by reference, name or
     email, and cancelled if need be.

  Selling and admitting happen at the box office, not here.
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
// Server-rendered, so the table arrives populated instead of appearing a moment
// later. requestFetch, not a bare $fetch: every admin endpoint is behind
// authorize(), and a plain server-side fetch does not forward the incoming
// session cookie — it would 403 during SSR. See
// docs/02-architecture.md#fetching-in-the-admin-area.
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
    // The server refuses ON_SALE for a product covering no shows, and says why
    // — surface that rather than a generic failure.
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
// Server-side search and pagination: there will be thousands of these and D1
// bills by rows read, so the browser never receives the whole table.
const search = ref('')
const page = ref(1)
const limit = 25

const debouncedSearch = useDebouncedRef(search, {
  onSettle: () => { page.value = 1 },
})

// Searching and paging re-run this on the client, which does not suspend the
// page — so the table stays interactive while it refetches.
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
          @click="createOpen = true"
        />
      </template>
    </AdminTableToolbar>

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

              <!-- Until this existed a pass product could only ever be DRAFT,
                   and the box office's Sell tab — which lists ON_SALE types
                   only — was permanently empty. -->
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
