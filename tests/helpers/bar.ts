import { MEASURE_KINDS } from '#shared/utils/bar'
import type { ServingKind } from '#shared/utils/bar'

// A suite's own request function, already signed in as somebody who may write the catalogue.
export type Send = (method: string, path: string, body?: unknown) => Promise<Response>

interface ListedVariant { id: string, status: string, servingKind: ServingKind, components: unknown[] }

// A fixture step that is refused throws here, so a suite never goes on from a product that is
// not on the till and fails later for a reason that points somewhere else.
async function landed(answered: Promise<Response>, step: string): Promise<Response> {
  const response = await answered
  if (!response.ok) throw new Error(`putOnTheTill: ${step} answered ${response.status}: ${await response.text()}`)
  return response
}

// Each size with no recipe gets an unrestricted stocked item of its own to deplete (F-113),
// in millilitres for a measure, since a measure on whole items is refused.
export async function putOnTheTill(send: Send, productId: string): Promise<Response> {
  const listed = await (await landed(send('GET', `/api/admin/bar/products/${productId}/variants`), 'listing the sizes')).json() as { variants: ListedVariant[] }
  for (const variant of listed.variants.filter(size => size.status === 'ACTIVE' && size.components.length === 0)) {
    const stocked = { name: `Stock ${crypto.randomUUID().slice(0, 8)}`, unit: MEASURE_KINDS.includes(variant.servingKind) ? 'ML' : 'ITEM', ageRestricted: false }
    const { id: itemId } = await (await landed(send('POST', '/api/admin/bar/items', stocked), 'adding the stock')).json() as { id: string }
    await landed(send('POST', '/api/admin/bar/movements', { itemId, qty: 1000, kind: 'DELIVERY' }), 'delivering the stock')
    await landed(send('PUT', `/api/admin/bar/variants/${variant.id}/components`, { components: [{ itemId, qty: 1 }] }), 'setting the recipe')
  }
  return landed(send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' }), 'activating')
}
