// A fixture fact: the person is one of the regulars the requirement tests list.
import { defineFact } from '#kit'
import { members } from '../contributions/core.requirement/seats'

export default defineFact(actor => !!actor.accountId && members.has(actor.accountId))
