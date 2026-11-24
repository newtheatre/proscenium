// Connect a calendar (S14): the person's connections and the actions on one. The address is sent
// once, when connecting, and never comes back.
import type { ConnectionKind, ConnectionState, TentativeAs } from '../../shared/levels'

export interface Connection { id: string, kind: ConnectionKind, label: string, tentativeAs: TentativeAs, state: ConnectionState, lastSyncedAt: number | null }
export interface Calendars { offers: { ics: boolean }, max: number, connections: Connection[] }

const TONE: Record<ConnectionState, 'success' | 'warning' | 'danger'> = { active: 'success', failing: 'warning', broken: 'danger' }

export async function useCalendars() {
  const { $api } = useNuxtApp()
  const { t } = useT()
  const toast = useToast()
  const { toRefusal, phrase } = useRefusal()
  const { data, status, error, refresh } = await useAPI<Calendars>('/api/availability/calendars', { key: 'availability:calendars' })

  async function act(path: string, body: Record<string, unknown>, done: string, method: 'POST' | 'PUT' = 'POST') {
    try {
      await $api(path, { method, body })
      toast.add({ title: done, color: 'success' })
    }
    catch (e) {
      const refusal = toRefusal(e)
      toast.add({ title: phrase(refusal.reason) ?? t('availability.calendars.failed'), description: phrase(refusal.remedy), color: 'error' })
    }
    await refresh()
  }

  const refreshNow = (c: Connection) => act(`/api/availability/calendars/${c.id}/refresh`, {}, t('availability.calendars.refreshed'))
  const disconnect = (c: Connection) => act(`/api/availability/calendars/${c.id}/disconnect`, {}, t('availability.calendars.disconnected'))
  const setTentative = (c: Connection, tentativeAs: TentativeAs) => act(`/api/availability/calendars/${c.id}`, { label: c.label, tentativeAs }, t('availability.calendars.saved'), 'PUT')
  const tone = (s: ConnectionState) => TONE[s]

  return { data, status, error, refresh, refreshNow, disconnect, setTentative, tone }
}
