// A suite's own request function, already signed in as somebody who may write the catalogue.
export type Send = (method: string, path: string, body?: unknown) => Promise<Response>

interface ListedVariant { id: string, status: string, components: unknown[] }

// A size goes on the till only with something for a sale to deplete (F-113), so each size with no
// recipe gets a stocked item of its own, unrestricted so the product's own flag still decides.
export async function putOnTheTill(send: Send, productId: string): Promise<Response> {
  const listed = await (await send('GET', `/api/admin/bar/products/${productId}/variants`)).json() as { variants: ListedVariant[] }
  for (const variant of listed.variants.filter(size => size.status === 'ACTIVE' && size.components.length === 0)) {
    const stocked = { name: `Stock ${crypto.randomUUID().slice(0, 8)}`, unit: 'ITEM', ageRestricted: false }
    const { id: itemId } = await (await send('POST', '/api/admin/bar/items', stocked)).json() as { id: string }
    await send('POST', '/api/admin/bar/movements', { itemId, qty: 1000, kind: 'DELIVERY' })
    await send('PUT', `/api/admin/bar/variants/${variant.id}/components`, { components: [{ itemId, qty: 1 }] })
  }
  return send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
}
