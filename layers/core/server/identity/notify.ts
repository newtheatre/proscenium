// A stand-in for the core domain's transactional email (C-27, C-28, C-32), with the same shape as
// its `notifyAddress`, so identity can be built and tested before that lands. When it does, the
// calls below switch to it and this file goes. Until then nothing is sent from a deployed site:
// in development the link and code are written to the log, and tests capture them.
import { log, useContext } from '#kit'

export interface SignInMessage {
  address: string
  template: 'core.sign-in-link'
  variables: { link: string, code: string }
}

export type Mailer = (message: SignInMessage) => Promise<void>

let mailer: Mailer | undefined

/** Tests capture outgoing mail here; the core domain's sender replaces this when it lands. */
export function setMailer(next: Mailer | undefined): void {
  mailer = next
}

export async function sendSignInMessage(message: SignInMessage): Promise<void> {
  if (mailer) return mailer(message)
  if (useContext().env.PROSCENIUM_DEV_MAIL === '1') {
    log.info('core.dev.sign-in-link', { link: message.variables.link, code: message.variables.code })
    return
  }
  throw new Error('No email sender is installed yet: core.sign-in-link cannot be sent')
}
