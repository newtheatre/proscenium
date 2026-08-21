import { computed, useAsyncData, useRequestFetch, useRoute } from '#imports'

export interface FohPerformance {
  id: string
  startsAt: string
  doorsAt: string | null
  showTitle: string
  showSlug: string
  venueName: string
  shiftRole: 'DUTY_MANAGER' | 'DOOR' | 'BAR' | null
}

export interface FohScope {
  night: string
  performances: FohPerformance[]
  bypassedRota: boolean
  rosteredOnNothing: boolean
}

/**
 * Tonight's scope, and which performance a sub-page is about: the `performance`
 * query where given, otherwise the only one there is.
 */
export async function useFohTonight() {
  const route = useRoute()
  const requestFetch = useRequestFetch()
  const { data, status } = await useAsyncData('foh-tonight', () => requestFetch<FohScope>('/api/foh/tonight'))

  const performances = computed<FohPerformance[]>(() => data.value?.performances ?? [])
  const performance = computed<FohPerformance | null>(() => {
    const wanted = route.query.performance
    if (typeof wanted === 'string') return performances.value.find(p => p.id === wanted) ?? null
    return performances.value.length === 1 ? performances.value[0]! : null
  })

  return { scope: data, status, performances, performance }
}
