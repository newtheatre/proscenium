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

// Criterion 1's confirmation, and criterion 4's removal link, which every waiting-list email
// carries regardless of what it is otherwise about.
export async function sendWaitingListJoined(event: H3Event | undefined, context: WaitingListJoinedContext): Promise<void> {
  await notify(event, {
    userId: context.userId,
    type: 'waiting-list.joined',
    context: {
      name: '',
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      partySize: context.partySize,
      removeUrl: `${useRuntimeConfig(event).public.baseURL}/waiting-list/leave/${context.token}`,
    },
  })
}

export interface WaitingListOfferedContext {
  userId: string
  showTitle: string
  startsAt: number
  expiresAt: number
  token: string
}

// Criterion 2's offer email: one link claims, the same link (D-110 style, self-service) shows
// the offer if opened again before it lapses.
export async function sendWaitingListOffered(event: H3Event | undefined, context: WaitingListOfferedContext): Promise<void> {
  const base = useRuntimeConfig(event).public.baseURL
  await notify(event, {
    userId: context.userId,
    type: 'waiting-list.offered',
    context: {
      name: '',
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      expires: formatLondon(new Date(context.expiresAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      claimUrl: `${base}/waiting-list/entry/${context.token}`,
      removeUrl: `${base}/waiting-list/leave/${context.token}`,
    },
  })
}
