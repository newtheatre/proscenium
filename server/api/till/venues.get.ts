// Which venue to name, the question the guard asks when it refuses a request naming none (F-125).

// The one route here resolving no night authority: it would refuse the caller who needs it (0077).
export default defineEventHandler(async (event) => {
  const resolved = await authority(event)
  const night = currentShowNight()

  // A `night.till` holder may open a session anywhere, which is what lets the bar manager open a
  // hire night the rota never covered; everybody else sees only where they are working.
  const officer = resolved.permissions.has('night.till')
  // The same gate the bypass itself carries: a standing grant being used needs the second factor,
  // and reading the estate list is the first half of using it (A-112, 0044).
  if (officer) await requireSecondFactorIfPrivileged(event, resolved)

  const venues = await tillVenuesFor(resolved.account.id, night, officer)

  return { night, venues }
})
