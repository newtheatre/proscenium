import { MAX_PAGE_SIZE } from '#shared/utils/pagination'

export interface CatalogueModule { id: string, name: string, status: string, signoffRequired: boolean, kind: string }

// What a sessions screen offers to teach from. A catalogue reader gets the admin catalogue whole;
// a trainer with no role reads the member one, narrowed to what they hold (issue 1336).
export async function teachingCatalogue(request: ReturnType<typeof useRequestFetch>, readsCatalogue: boolean): Promise<{ items: CatalogueModule[] }> {
  if (readsCatalogue) {
    return request<{ items: CatalogueModule[] }>('/api/admin/training/modules', { query: { pageSize: MAX_PAGE_SIZE } })
  }
  const member = await request<{ items: (CatalogueModule & { held: boolean })[] }>('/api/training/modules')
  return { items: member.items.filter(one => one.held) }
}
