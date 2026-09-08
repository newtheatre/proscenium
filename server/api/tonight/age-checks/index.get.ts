import type { AgeCheckEntry } from '#server/utils/age-checks'

// Tonight's register, superseded entries and all: the chain has to stay visible (E-118 criterion
// 3, criterion 4's standalone read from the tonight and door screens).
export default defineEventHandler(async (event) => {
  await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'])
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const { from, to } = showNightBounds(currentShowNight())
  const bounds = [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)] as const

  const [items, [totalRow]] = await Promise.all([
    db.all<AgeCheckEntry>(ageChecksOnQuery(...bounds, pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(countAgeChecksOnQuery(...bounds)),
  ])

  return envelope(items, totalRow?.total ?? 0, page, pageSize)
})
