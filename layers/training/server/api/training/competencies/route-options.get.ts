// What K8's routes editor offers: courses not retired, and requirements other modules recognise.
import { defineRoute } from '#kit'
import { routeOptions } from '../../../console-competencies'

export default defineRoute({ ability: 'training.competency.manage', rateLimit: 'default' }, () => routeOptions())
