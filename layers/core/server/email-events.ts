// core.email-events: what the Worker does with each Email Sending outcome. The kit routes the
// EMAIL_EVENTS queue here (layers/core/kit/email-events.ts) and owns acknowledging, retrying and
// setting messages aside. The core domain's notifications fill this in: matching the delivery by
// its provider reference, recording the outcome, suppression, and announcing core.delivery.*.
import type { EmailEventsConsumer } from '#kit/email-events'

export const emailEventsConsumer: EmailEventsConsumer | undefined = undefined
