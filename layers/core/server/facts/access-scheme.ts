// core.access-scheme: the person's access application is accepted (ID-43). It has no holders, so
// nobody can list who is on the scheme through it, and it opens nothing on the members' side.
import { defineFact } from '#kit'
import { onScheme } from '../identity/access-scheme'

export default defineFact(actor => onScheme(actor.accountId))
