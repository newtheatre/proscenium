// My availability (S1): the days in view, painting strokes as entries or into the pattern, and the
// person's entries and requests. Asks once per visit whether painting a pattern day means just that day.
import { today as todayIn } from '@internationalized/date'
import { addDays, clockOf, DAY_MINUTES, mondayOf, type Day } from '../../shared/grid'
import type { Level, Unmarked } from '../../shared/levels'

export type Tool = Level | 'clear'
export type Target = 'days' | 'pattern'
export interface Pattern { id: string, label: string, startsOn: string, endsOn: string | null, lines: { weekday: number, from: string, until: string, level: Level }[] }
export interface Entry { id: string, firstDate: string, lastDate: string, weekdays: number[] | null, from: string | null, until: string | null, level: Level, reason: string | null, reasonShared: boolean, onBehalf: boolean, requestId: string | null }
export interface AskedRequest { id: string, title: string, from: string, to: string, dueOn: string, state: 'asked' | 'answered' | 'lapsed' | 'withdrawn', open: boolean }
export interface Mine {
  today: string
  horizon: string
  grid: { step: number, dayStarts: string, dayEnds: string }
  profile: { unmarkedMeans: Unmarked | null, unmarked: Unmarked, changedAt: number | null, checkedTo: string | null }
  patterns: Pattern[]
  exceptions: Entry[]
  days: Day[]
  requests: AskedRequest[]
}
interface Stroke { date: string, start: number, end: number }

const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const PHONE_DAYS = 3 // not-policy: spec part 5, a phone shows three days
const WEEK_DAYS = 7 // not-policy: a week

/** `home` is the first day shown when the address names none: today on S1, a request's first day on S5. */
export async function useMyAvailability(options: { home?: Ref<string | null> } = {}) {
  const route = useRoute()
  const router = useRouter()
  const dates = useDates()
  const { t } = useT()
  const { $api } = useNuxtApp()
  const toast = useToast()
  const { toRefusal, phrase } = useRefusal()

  const phone = useScreenQuery('(max-width: 767px)') // not-policy: Tailwind's md breakpoint
  const length = computed(() => phone.value ? PHONE_DAYS : WEEK_DAYS)
  const asked = computed(() => {
    const q = route.query.from
    return typeof q === 'string' && DATE.test(q) ? q : options.home?.value ?? todayIn(dates.zone.value).toString()
  })
  const from = computed(() => phone.value ? asked.value : mondayOf(asked.value))
  const query = computed(() => ({ from: from.value, to: addDays(from.value, length.value - 1) }))
  const { data, status, error, refresh } = await useAPI<Mine>('/api/availability/me', { key: 'availability:me', query, watch: [query] })

  const go = (date: string | undefined) => router.replace({ query: { ...route.query, from: date } })
  const move = (direction: 1 | -1) => go(addDays(from.value, direction * length.value))
  const heading = computed(() => dates.range(query.value.from, query.value.to))

  const patternOn = (date: string) => data.value?.patterns.find(p => p.startsOn <= date && (!p.endsOn || date <= p.endsOn))
  const patternLabels = computed(() => Object.fromEntries((data.value?.days ?? []).flatMap((d) => {
    const p = patternOn(d.date)
    return p ? [[d.date, p.label]] : []
  })))

  const tool = ref<Tool>('busy')
  const target = ref<Target | null>(null)
  const pending = ref<Stroke | null>(null)
  const saving = ref(false)

  function fail(e: unknown) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), description: phrase(refusal.remedy), color: 'error' })
  }

  async function send(s: Stroke, to: Target) {
    saving.value = true
    try {
      const whole = s.start === 0 && s.end === DAY_MINUTES
      await $api('/api/availability/paint', {
        method: 'POST',
        body: { date: s.date, from: whole ? null : clockOf(s.start), until: whole ? null : clockOf(s.end), level: tool.value, target: to },
      })
      await refresh()
    }
    catch (e) {
      fail(e)
    }
    finally {
      saving.value = false
    }
  }

  /** A stroke from the grid. On a pattern day, the first one asks what it changes (W1). */
  function paint(s: Stroke) {
    if (!patternOn(s.date)) return send(s, 'days')
    if (target.value) return send(s, target.value)
    pending.value = s
  }

  function choose(to: Target) {
    target.value = to
    const s = pending.value
    pending.value = null
    if (s) void send(s, to)
  }

  async function removeEntry(id: string) {
    try {
      await $api(`/api/availability/exceptions/${id}`, { method: 'DELETE', body: {} })
      toast.add({ title: t('availability.mine.entry-removed'), color: 'success' })
      await refresh()
    }
    catch (e) {
      fail(e)
    }
  }

  async function answer(id: string) {
    try {
      await $api(`/api/availability/requests/${id}/answer`, { method: 'POST', body: {} })
      toast.add({ title: t('availability.mine.answered'), color: 'success' })
      await refresh()
    }
    catch (e) {
      fail(e)
    }
  }

  return { data, status, error, refresh, query, heading, go, move, patternOn, patternLabels, tool, target, pending, saving, paint, choose, removeEntry, answer }
}
