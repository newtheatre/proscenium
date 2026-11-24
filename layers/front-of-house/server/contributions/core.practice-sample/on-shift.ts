// Sample set front-of-house.on-shift (Practice mode, part 4; FH-55): tonight's practice play on a
// published rota, the trainee leading it and four practice people stewarding, all confirmed and called
// for now, with an opening checklist and the venue's emergency card. The theatre's own copied duties,
// checklist and card serve where it has them; each step is a unit of its own, as each reads the last.
import { createUnit, definePracticeSample, wordsFrom, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { addShift, createDuty, listDuties, shiftsOf, type Duty } from '../../shifts'
import { publishShifts } from '../../rota'
import { assignPerson } from '../../people'
import { createChecklist, listChecklists } from '../../checklists'
import { getCard, saveCard } from '../../emergency'
import en from '../../../i18n/en-GB.json'

const t = wordsFrom(en)
const MINUTE = 60_000 // not-policy: a minute in milliseconds
const STEWARDS = ['person1', 'person2', 'person3', 'person4'] // not-policy: the four practice people core.people names first
const ITEMS = ['exits', 'first-aid-kit', 'toilets', 'auditorium']

type Place = { venueId: string, staffId: string }

/** A duty of the theatre's own, lead or not, or one made for practice. */
function dutyFor(unit: UnitView, duties: Duty[], lead: boolean): string {
  const found = duties.find(d => d.isLead === lead)
  if (found) return found.id
  const name = t(lead ? 'front-of-house.practice.duty-manager' : 'front-of-house.practice.steward')
  return createDuty(unit, { name, isLead: lead, callBeforeMinutes: lead ? 90 : 45, stayAfterMinutes: 30 }) // not-policy: a practice duty's call and stay
}

/** The first opening checklist that applies at the venue, or one made for practice. */
async function checklistFor(unit: UnitView, venueId: string): Promise<string> {
  const found = (await listChecklists()).find(c => c.moment === 'pre-show' && (c.venueId === null || c.venueId === venueId))
  if (found) return found.id
  return createChecklist(unit, { name: t('front-of-house.practice.checklist'), moment: 'pre-show', venueId, items: ITEMS.map(item => ({ label: t(`front-of-house.practice.item.${item}`) })) })
}

/** The duties, checklist and card tonight needs, made where the theatre's own did not come across. */
async function setUp({ venueId, staffId }: Place): Promise<{ lead: string, steward: string, checklist: string }> {
  const unit = createUnit()
  const duties = await listDuties()
  const made = { lead: dutyFor(unit.view(), duties, true), steward: dutyFor(unit.view(), duties, false), checklist: await checklistFor(unit.view(), venueId) }
  if (!(await getCard(venueId))) await saveCard(unit.view(), { venueId, body: t('front-of-house.practice.card'), reviewed: true, by: staffId })
  await unit.commit()
  return made
}

export default definePracticeSample({
  after: ['core.tonight'],
  async seed(_unit, { accountId, staffId, startedAt, results }) {
    const performance = await getPerformance(results.tonight!)
    const { lead, steward, checklist } = await setUp({ venueId: performance.venueId, staffId })
    // Called for now, or earlier where the duty's own call is: the window is open as the trainee arrives.
    const duties = await listDuties()
    const callAt = (dutyId: string) => Math.min(performance.startsAt - (duties.find(d => d.id === dutyId)?.callBeforeMinutes ?? 0) * MINUTE, startedAt)
    const shifts = createUnit()
    const leadShift = await addShift(shifts.view(), performance.id, { dutyId: lead, places: 1, callAt: callAt(lead), signUp: false })
    const stewardShift = await addShift(shifts.view(), performance.id, { dutyId: steward, places: STEWARDS.length, callAt: callAt(steward), signUp: false })
    await shifts.commit()

    const rota = createUnit()
    await publishShifts(rota.view(), await shiftsOf(performance.id))
    await rota.commit()
    // One unit for each place, as a manager putting people on the rota makes them.
    const places = [{ shiftId: leadShift, person: accountId }, ...STEWARDS.map(p => ({ shiftId: stewardShift, person: results[p]! }))]
    for (const { shiftId, person } of places) {
      const place = createUnit()
      await assignPerson(place.view(), { shiftId, accountId: person, by: staffId, override: true })
      await place.commit()
    }
    return { venue: performance.venueId, checklist }
  },
})
