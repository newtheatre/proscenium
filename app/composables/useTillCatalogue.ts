import { nightCacheKey } from '#shared/utils/night-cache'
import { currentShowNight } from '#shared/utils/show-night'
import { useNightCache } from './useNightCache'
import type { Ref } from 'vue'
import type { Discount } from '#shared/utils/discounts'
import type { SaleCatalogue, SaleProduct } from '#shared/utils/sale'
import type { TillSession } from '#shared/utils/till'

export interface TabHolder { id: string, name: string }

// The catalogue as the server read it while rendering the page, and when.
export interface ServedCatalogue { data: SaleCatalogue, at: number }

function readSaleCatalogue(request: ReturnType<typeof useRequestFetch>, venueId: string | null): Promise<SaleCatalogue> {
  return request<SaleCatalogue>('/api/till/products', { query: { venueId: venueId ?? undefined } })
}

// For the served page alone, and only over an open session; a failed read serves no grid, and the
// phone's own copy and refresh take over once mounted. `request` is the page's, taken during setup.
export async function readServedCatalogue(request: ReturnType<typeof useRequestFetch>, session: TillSession | null, venueId: string | null): Promise<ServedCatalogue | null> {
  if (!session || !venueId) return null
  const read = await settleRead(() => readSaleCatalogue(request, venueId))
  return read.kind === 'READ' ? { data: read.value, at: read.at } : null
}

// The till's device-held reference data (K-103): the catalogue, active discounts and who may be
// charged to a tab, none of which changes mid-sale often enough to justify its own poll.
export function useTillCatalogue(session: Ref<TillSession | null>, venueId: Ref<string | null>, served: Ref<ServedCatalogue | null>) {
  const request = useRequestFetch()

  // Whole-night, not venue-scoped: products, variants and prices are estate-wide (F-202).
  const catalogueKey = computed(() => nightCacheKey({ screen: 'till-products', night: currentShowNight(), wholeNight: true }))
  const catalogue = useNightCache<SaleCatalogue>(catalogueKey, () => readSaleCatalogue(request, venueId.value), { immediate: false })

  watch([session, venueId], () => {
    if (session.value && venueId.value) void catalogue.refresh()
  })

  // The grid's stock labels trail the shelf from the moment they load, so coming back to the till
  // (from the SumUp app, say) reads them again (F-128 criterion 8).
  function onReturn(): void {
    if (document.visibilityState === 'visible' && session.value && venueId.value) void catalogue.refresh()
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', onReturn)
    // A session the served page carried was there before the watchers above, which never saw it
    // arrive; the served grid is as fresh as a refresh, so the device keeps it unless its own is newer.
    if (!session.value || !venueId.value) return
    if (served.value) catalogue.adopt(served.value.data, served.value.at)
    else void catalogue.refresh()
    void discounts.refresh()
    void tabHolders.refresh()
  })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onReturn))

  // The served copy until the device holds one, which after mount is the newer of the two.
  const sale = computed(() => catalogue.data.value ?? served.value?.data ?? null)
  const saleAt = computed(() => catalogue.data.value ? catalogue.cachedAt.value : (served.value?.at ?? null))
  const categories = computed(() => sale.value?.categories ?? [])
  const products = computed(() => sale.value?.products ?? [])
  const productsIn = (categoryId: string): SaleProduct[] => products.value.filter(product => product.categoryId === categoryId)

  // Active discounts only: a manager who retires one mid-service should not see it offered a
  // moment later (F-117).
  const discountsKey = computed(() => nightCacheKey({ screen: 'till-discounts', night: currentShowNight(), wholeNight: true }))
  const discounts = useNightCache<{ discounts: Discount[] }>(discountsKey, () =>
    request<{ discounts: Discount[] }>('/api/till/discounts', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

  watch([session, venueId], () => {
    if (session.value && venueId.value) void discounts.refresh()
  })

  const selectedDiscountId = ref<string | null>(null)

  // Who the till may charge a sale to instead of the reader (F-108). The allow-list is short by
  // nature, so this refreshes alongside the catalogue rather than needing its own trigger.
  const tabHoldersKey = computed(() => nightCacheKey({ screen: 'till-tab-holders', night: currentShowNight(), wholeNight: true }))
  const tabHolders = useNightCache<{ holders: TabHolder[] }>(tabHoldersKey, () =>
    request<{ holders: TabHolder[] }>('/api/till/tab-holders', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

  watch([session, venueId], () => {
    if (session.value && venueId.value) void tabHolders.refresh()
  })

  const selectedTabHolderId = ref<string | null>(null)

  return {
    catalogue,
    sale,
    saleAt,
    categories,
    products,
    productsIn,
    discounts,
    selectedDiscountId,
    tabHolders,
    selectedTabHolderId,
  }
}
