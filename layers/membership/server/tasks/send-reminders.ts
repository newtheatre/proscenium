// The renewal reminders (R7 to R9): renewal is open, the last reminder, and lapsed. A daily task;
// each reminder is recorded in last_reminder in the unit that queues it, and the message carries a
// dedupe key, so running twice sends once (R8). Nobody who has renewed gets one, and an indefinite
// membership gets none. The lapse reminder goes only in the week after grace ends, so switching it
// on does not write to everybody who ever lapsed.
import { all, defineTask, siteUrl, useSetting } from '#kit'
import { notify } from '#modules/core'
import { todayOrNull } from '../memberships'

const DAY = 86_400 // not-policy: seconds in a day
const LAPSED_WITHIN = 7 // not-policy: how late a lapse reminder may still go out

interface Due { id: string, account_id: string, scheme_name: string, ends_on: string }

export default defineTask(async (unit) => {
  const day = await todayOrNull()
  if (!day) return
  const days = async (key: 'membership.reminders.first' | 'membership.reminders.final') => Math.floor(Number(await useSetting(key) ?? 0) / DAY)
  const first = await days('membership.reminders.first')
  const final = await days('membership.reminders.final')
  const afterLapse = !!(await useSetting('membership.reminders.after-lapse'))
  const link = await siteUrl('/account/membership')

  const notRenewed = 'NOT EXISTS (SELECT 1 FROM membership_memberships r WHERE r.renews_id = m.id AND r.state IN (\'pending\', \'active\'))'
  const base = `SELECT m.id, m.account_id, s.name AS scheme_name, m.ends_on FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
    WHERE m.state = 'active' AND m.ends_on IS NOT NULL AND s.state <> 'archived' AND ${notRenewed}`

  // Renewal is open: from the later of the window opening and `first` before the end, until the end.
  const opened = await all<Due>(`${base} AND s.renewal_opens_days > 0 AND m.last_reminder IS NULL AND ?1 <= m.ends_on AND ?1 >= date(m.ends_on, '-' || min(s.renewal_opens_days, ?2) || ' days')`, day, first)
  // The last reminder: `final` before the end.
  const last = await all<Due>(`${base} AND s.renewal_opens_days > 0 AND (m.last_reminder IS NULL OR m.last_reminder = 'window-open') AND ?1 <= m.ends_on AND ?1 >= date(m.ends_on, '-' || ?2 || ' days')`, day, final)
  // Lapsed: the day after grace ends, and for a week after.
  const lapsed = afterLapse
    ? await all<Due>(`${base} AND (m.last_reminder IS NULL OR m.last_reminder <> 'lapsed') AND ?1 > date(m.ends_on, '+' || s.grace_days || ' days') AND ?1 <= date(m.ends_on, '+' || (s.grace_days + ?2) || ' days')`, day, LAPSED_WITHIN)
    : []

  const lastIds = new Set(last.map(m => m.id))
  const send = async (rows: Due[], kind: 'window-open' | 'final' | 'lapsed', type: string) => {
    for (const m of rows) {
      unit.add({ sql: 'UPDATE membership_memberships SET last_reminder = ? WHERE id = ?', params: [kind, m.id] })
      await notify(unit, type, {
        to: m.account_id,
        variables: { scheme: m.scheme_name, ends: m.ends_on, link },
        subject: ['membership.membership', m.id],
        dedupeKey: `${kind}:${m.id}`,
      })
    }
  }
  // A membership due both reminders on one day gets only the last.
  await send(opened.filter(m => !lastIds.has(m.id)), 'window-open', 'membership.renewal-open')
  await send(last, 'final', 'membership.renewal-final')
  await send(lapsed, 'lapsed', 'membership.lapsed')
})
