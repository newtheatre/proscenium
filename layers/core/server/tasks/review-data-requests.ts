// Hourly: an erasure whose cooling-off is over runs if no module holds it, and is held, with the
// hold codes, if one does (ID-16, ID-35).
import { defineTask } from '#kit'
import { reviewDataRequests } from '../identity/data-requests'

export default defineTask(async unit => reviewDataRequests(unit))
