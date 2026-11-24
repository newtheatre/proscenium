// Sample set core.tonight (Practice mode, part 4; C-76): "The Practice Play", with tonight's
// performance at the first active venue starting 45 minutes after the session starts. With no venue
// copied, a practice venue stands in.
import { all, definePracticeSample, refuse, TIME_ZONE_REMEDY, wordsFrom } from '#kit'
import { dayRule, operatingDayAt } from '../../calendar'
import { ensureVocabularies } from '../../vocabularies/service'
import { performances, productions, spaces, venues } from '../../db/domain'
import en from '../../../i18n/en-GB.json'

const t = wordsFrom(en)
const MINUTE = 60_000 // not-policy: a minute in milliseconds

async function place(unit: Parameters<Parameters<typeof definePracticeSample>[0]['seed']>[0]): Promise<{ venueId: string, spaceId: string }> {
  const [found] = await all<{ venue_id: string, space_id: string }>(`SELECT v.id AS venue_id, s.id AS space_id FROM core_venues v JOIN core_spaces s ON s.venue_id = v.id
    WHERE v.state = 'active' AND s.state = 'active' AND s.performable = 1 ORDER BY v.name, s.sort LIMIT 1`)
  if (found) return { venueId: found.venue_id, spaceId: found.space_id }
  // Without the theatre's own setup the shipped vocabularies stand in, as on a new site.
  await ensureVocabularies()
  const [kind] = await all<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.space-kind' AND retired_at IS NULL ORDER BY slug = 'auditorium' DESC, sort LIMIT 1")
  const [venueId] = unit.insertSet(venues, [{ slug: 'practice-theatre', name: t('core.practice.venue-name') }])
  const [spaceId] = unit.insertSet(spaces, [{ venueId: venueId!, slug: 'main', name: t('core.practice.space-name'), kindTermId: kind!.id }])
  return { venueId: venueId!, spaceId: spaceId! }
}

export default definePracticeSample({
  after: ['core.people'],
  async seed(unit, { startedAt }) {
    const { venueId, spaceId } = await place(unit)
    const startsAt = startedAt + 45 * MINUTE // not-policy: the spec fixes tonight's start 45 minutes after the session starts
    const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', "The theatre's time zone has not been set yet.", { status: 409, remedy: TIME_ZONE_REMEDY })
    const [productionId] = unit.insertSet(productions, [{ slug: 'the-practice-play', title: t('core.practice.play-title'), kind: 'own', creditsPublic: false, state: 'published', firstStartsAt: startsAt, lastEndsAt: startsAt + 150 * MINUTE }]) // not-policy: a two and a half hour show
    const [tonight] = unit.insertSet(performances, [{
      productionId: productionId!,
      venueId,
      spaceId,
      startsAt,
      doorsAt: startsAt - 30 * MINUTE, // not-policy: doors half an hour before
      endsAt: startsAt + 150 * MINUTE, // not-policy: a two and a half hour show
      operatingDay: operatingDayAt(startsAt, rule),
      state: 'scheduled',
    }])
    return { production: productionId!, tonight: tonight! }
  },
})
