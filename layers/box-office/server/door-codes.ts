// Door codes of other kinds (box-office.door-code): finding the contribution for a kind, and signing
// a code for one. Box office signs, so the key never leaves this module.
import { usePoint } from '#kit'
import { signing } from '#kit/signing'
import type { DoorCodeKind } from './points/door-code'
import { DOOR_CODE_PURPOSE, signedPart, TICKET_KIND } from './tickets'

export async function doorCodeKind(kind: string): Promise<DoorCodeKind | null> {
  if (kind === TICKET_KIND) return null
  for (const c of await usePoint<DoorCodeKind>('box-office.door-code')) if (c.value?.kind === kind) return c.value
  return null
}

/** Signs a contributed kind's code part: `<kind>.<key id>.<code>.<signature>`. */
export async function signDoorCode(kind: string, code: string): Promise<string> {
  const { keyId, signature } = await signing.sign(DOOR_CODE_PURPOSE, id => signedPart(kind, id, code))
  return `${signedPart(kind, keyId, code)}.${signature}`
}
