import { nightCacheKey } from '#shared/utils/night-cache'
import { currentShowNight } from '#shared/utils/show-night'
import { useNightCache } from './useNightCache'
import type { Ref } from 'vue'
import type { Discount } from '#shared/utils/discounts'
import type { SaleCatalogue, SaleProduct } from '#shared/utils/sale'
import type { TillSession } from '#shared/utils/till'

export interface TabHolder { id: string, name: string }

// The till's device-held reference data (K-103): the catalogue, active discounts and who may be
// charged to a tab, none of which changes mid-sale often enough to justify its own poll.
export function useTillCatalogue(session: Ref<TillSession | null>, venueId: Ref<string | null>) {
  const request = useRequestFetch()

  // Whole-night, not venue-scoped: products, variants and prices are estate-wide (F-202).
  const catalogueKey = computed(() => nightCacheKey({ screen: 'till-products', night: currentShowNight(), wholeNight: true }))
  const catalogue = useNightCache<SaleCatalogue>(catalogueKey, () =>
    request<SaleCatalogue>('/api/till/products', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

  watch([session, venueId], () => {
    if (session.value && venueId.value) void catalogue.refresh()
  })

  const categories = computed(() => catalogue.data.value?.categories ?? [])
  const products = computed(() => catalogue.data.value?.products ?? [])
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
    categories,
    products,
    productsIn,
    discounts,
    selectedDiscountId,
    tabHolders,
    selectedTabHolderId,
  }
}
