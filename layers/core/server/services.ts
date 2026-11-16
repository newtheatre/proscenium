// The core domain's services, for other modules: import notifyAddress from the core's services alias.
// Foundations' services are the kit (#kit); identity adds its own here beside these.
export { notifyAddress } from './notifications/send'
export type { NotifyAddressOptions, NotificationType } from './notifications/send'
export { getBrand } from './brand/theme'
export { operatingDayOf, dayBounds, operatingDayAt, operatingDayBounds } from './calendar'
export { attachFile, detachFile, fileUrl } from './files/service'
export { findOrCreateAccount } from './identity/guests'
export type { FindOrCreateInput, FoundAccount, UnclaimedOrigin } from './identity/guests'
export { canonicalAccount, accountLabel } from './identity/accounts'
