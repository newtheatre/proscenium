// core.email-events: what the Worker does with each Email Sending outcome. The kit routes the
// EMAIL_EVENTS queue here (layers/core/kit/email-events.ts) and owns acknowledging, retrying and
// setting messages aside; recording the outcome is the core domain's (notifications/outcomes.ts).
import type { EmailEventsConsumer } from '#kit/email-events'
import { recordEmailOutcome, recordSetAside } from './notifications/outcomes'

export const emailEventsConsumer: EmailEventsConsumer = (event, unit, delivery) => recordEmailOutcome(event, unit, delivery)

export const emailEventsSetAside = recordSetAside
