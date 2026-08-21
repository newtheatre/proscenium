/**
 * Permission checks, resolved from this app's own manifest. No I/O and no
 * staleness of its own: a permission is a function of the session's roles.
 */

import { permissionResolver } from '@newtheatre/auth-types'
import { APP_MANIFEST } from './appManifest'

export const can = permissionResolver(APP_MANIFEST)

/** Every permission this app declares, for exhaustive checks. */
export type Permission = (typeof APP_MANIFEST)['permissions'][number]['key']
