import { PERIOD_KINDS, periodQuery } from '#shared/utils/season-dashboard'
import { calendarYearChoices, currentYear, monthChoices, yearChoices } from '#shared/utils/year'
import type { PeriodChoices, PeriodInput, PeriodKind } from '#shared/utils/season-dashboard'

// The money dashboard's period controls, shared by every screen that sends a `periodForm` (0087).
// Each screen names where its terms and seasons come from, so a reader holds only its own gate.
export async function usePeriodForm(key: string, choices: () => Promise<PeriodChoices>) {
  const { data } = await useAsyncData(key, choices, { default: (): PeriodChoices => ({ terms: [], seasons: [] }) })
  const terms = computed(() => data.value.terms)
  const seasons = computed(() => data.value.seasons)

  const today = londonDay(new Date())

  // TERM and SEASON have ranges rather than a formula, so each is offered only once one exists;
  // a season is sent by id and its days are the server's to read.
  const selectableKinds = computed(() => PERIOD_KINDS.filter(one =>
    (one !== 'TERM' || terms.value.length > 0) && (one !== 'SEASON' || seasons.value.length > 0)))
  const termItems = computed(() => terms.value.map(one => ({ label: one.label, value: one.id })))
  const seasonItems = computed(() => seasons.value.map(one => ({ label: one.name, value: one.id })))

  const kind = ref<PeriodKind>('YEAR')
  const seasonId = ref((seasons.value.find(one => one.fromDay <= today && today <= one.toDay) ?? seasons.value[0])?.id ?? '')
  const termId = ref(terms.value[0]?.id ?? '')
  const day = ref(today)
  const year = ref(currentYear())
  // A month's year is a calendar year and a 1 August year is the one it ends in, so they are two
  // controls and two lists, never one number standing for both.
  const monthYear = ref(Number(today.slice(0, 4)))
  const month = ref(Number(today.slice(5, 7)))

  const months = monthChoices()
  const years = yearChoices(year.value)
  const calendarYears = calendarYearChoices(monthYear.value)

  const term = computed(() => terms.value.find(one => one.id === termId.value) ?? terms.value[0])

  const period = computed<PeriodInput>(() => {
    if (kind.value === 'DAY') return { kind: 'DAY', day: day.value }
    if (kind.value === 'WEEK') return { kind: 'WEEK', day: day.value }
    if (kind.value === 'MONTH') return { kind: 'MONTH', year: monthYear.value, month: month.value }
    if (kind.value === 'TERM' && term.value) return { kind: 'TERM', fromDay: term.value.fromDay, toDay: term.value.toDay }
    if (kind.value === 'SEASON' && seasonId.value) return { kind: 'SEASON', seasonId: seasonId.value }
    return { kind: 'YEAR', year: year.value }
  })

  const query = computed(() => periodQuery(period.value))

  return {
    selectableKinds,
    termItems,
    seasonItems,
    kind,
    seasonId,
    termId,
    day,
    year,
    monthYear,
    month,
    months,
    years,
    calendarYears,
    query,
  }
}

export type PeriodForm = Awaited<ReturnType<typeof usePeriodForm>>
