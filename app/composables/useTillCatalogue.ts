import { nightCacheKey } from '#shared/utils/night-cache'
import { currentShowNight } from '#shared/utils/show-night'
import { useNightCache } from './useNightCache'
import { watchSinceMount } from '../utils/watch-since-mount'
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

// For the served page alone, and only over an open session: a phone navigating here draws its own
// copy and refreshes it (K-103). `request` is the page's, taken during setup.
export async function readServedCatalogue(request: ReturnType<typeof useRequestFetch>, session: TillSession | null, venueId: string | null): Promise<ServedCatalogue | null> {
  if (import.meta.client || !session || !venueId) return null
  const read = await settleRead(() => readSaleCatalogue(request, venueId))
  return read.kind === 'READ' ? { data: read.value, at: read.at } : null
}

// The till's device-held reference data (K-103): the catalogue, active discounts and who may be
// charged to a tab, none of which changes mid-sale often enough to justify its own poll.
export function useTillCatalogue(session: Ref<TillSession | null>, venueId: Ref<string | null>, served: Ref<ServedCatalogue | null>) {
  const request = useRequestFetch()

  // Whole-night, not venue-scoped: products, variants and prices are estate-wide (F-202).
  const catalogueKey = computed(() => nightCacheKey({ screen: 'till-products', night: currentShowNight(), wholeNight: true }))
  // The served grid is this request's own, so it stays on screen until the phone's refresh answers;
  // the device's copy, perhaps another bar's stock, is drawn only on a navigation with nothing served.
  const catalogue = useNightCache<SaleCatalogue>(catalogueKey, () => readSaleCatalogue(request, venueId.value), { immediate: false, served, hydrating: useNuxtApp().isHydrating })

  // The grid's stock labels trail the shelf from the moment they load, so coming back to the till
  // (from the SumUp app, say) reads them again (F-128 criterion 8).
  function onReturn(): void {
    if (document.visibilityState === 'visible' && session.value && venueId.value) void catalogue.refresh()
  }
  onMounted(() => document.addEventListener('visibilitychange', onReturn))
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onReturn))

  const sale = catalogue.shown
  const saleAt = catalogue.shownAt
  const categories = computed(() => sale.value?.categories ?? [])
  const products = computed(() => sale.value?.products ?? [])
  const productsIn = (categoryId: string): SaleProduct[] => products.value.filter(product => product.categoryId === categoryId)

  // Active discounts only: a manager who retires one mid-service should not see it offered a
  // moment later (F-117).
  const discountsKey = computed(() => nightCacheKey({ screen: 'till-discounts', night: currentShowNight(), wholeNight: true }))
  const discounts = useNightCache<{ discounts: Discount[] }>(discountsKey, () =>
    request<{ discounts: Discount[] }>('/api/till/discounts', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

  const selectedDiscountId = ref<string | null>(null)

  // Who the till may charge a sale to instead of the reader (F-108). The allow-list is short by
  // nature, so this refreshes alongside the catalogue rather than needing its own trigger.
  const tabHoldersKey = computed(() => nightCacheKey({ screen: 'till-tab-holders', night: currentShowNight(), wholeNight: true }))
  const tabHolders = useNightCache<{ holders: TabHolder[] }>(tabHoldersKey, () =>
    request<{ holders: TabHolder[] }>('/api/till/tab-holders', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

  const selectedTabHolderId = ref<string | null>(null)

  // Read afresh whenever the till has a session at a bar, a served one included.
  watchSinceMount([session, venueId], () => {
    if (!session.value || !venueId.value) return
    void catalogue.refresh()
    void discounts.refresh()
    void tabHolders.refresh()
  })

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
