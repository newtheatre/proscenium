import { notify } from './notify'
import { formatLondon } from '#shared/utils/london'
import type { H3Event } from 'h3'

// Kept apart from server/utils/waiting-list.ts, which `tests/` imports directly under Bun:
// `useRuntimeConfig()` needs a real Nitro runtime (reservation-confirmation.ts, the same split).

export interface WaitingListJoinedContext {
  userId: string
  showTitle: string
  startsAt: number
  partySize: number
  token: string
}

// Criterion 1's confirmation. Every waiting-list email links the entry page, which names the list
// and leaves through a named confirmation (criterion 4, issue 1340).
export async function sendWaitingListJoined(event: H3Event | undefined, context: WaitingListJoinedContext): Promise<void> {
  await notify(event, {
    userId: context.userId,
    type: 'waiting-list.joined',
    context: {
      name: '',
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      partySize: context.partySize,
      entryUrl: `${useRuntimeConfig(event).public.baseURL}/waiting-list/entry/${context.token}`,
    },
  })
}

export interface WaitingListOfferedContext {
  userId: string
  showTitle: string
  startsAt: number
  expiresAt: number
  partySize: number
  token: string
}

// Criterion 2's offer email: one link claims or leaves, and shows the offer again if opened before
// it lapses.
export async function sendWaitingListOffered(event: H3Event | undefined, context: WaitingListOfferedContext): Promise<void> {
  await notify(event, {
    userId: context.userId,
    type: 'waiting-list.offered',
    context: {
      name: '',
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      expires: formatLondon(new Date(context.expiresAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      partySize: context.partySize,
      entryUrl: `${useRuntimeConfig(event).public.baseURL}/waiting-list/entry/${context.token}`,
    },
  })
}
