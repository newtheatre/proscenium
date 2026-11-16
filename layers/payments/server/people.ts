// The names screens show beside the ids payments keeps: who opened a session, who asked for a refund.
// Each name is core's own label for the account, so a merged or anonymised person reads as core says.
import { accountLabel } from '#modules/core'

/** Each distinct account id's label, looked up once. */
export async function labelsOf(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const distinct = [...new Set(ids.filter((id): id is string => !!id))]
  return new Map(await Promise.all(distinct.map(async id => [id, await accountLabel(id)] as const)))
}
