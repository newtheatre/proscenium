// The incident practice's tasks (FH-55): the emergency card for tonight's venue opened, which leaves no
// row, so it reads the card's own answer; and an incident with first aid given reported with its people.
import { all, definePracticeChecks } from '#kit'

export default definePracticeChecks({
  'emergency-card': ({ answer, results }) =>
    !!answer && /\/emergency-cards\/[^/]+$/.test(answer.path) && (answer.body as { card?: { venueId?: string } | null } | null)?.card?.venueId === results.venue,
  'first-aid': async () => (await all(`SELECT 1 FROM front_of_house_incidents i WHERE i.first_aid_given = 1
    AND EXISTS (SELECT 1 FROM front_of_house_incident_people p WHERE p.incident_id = i.id) LIMIT 1`)).length > 0,
})
