import { APP_MANIFEST } from '../../../../shared/utils/appManifest'

/** This app's role and permission declaration, polled by the auth service. */
export default defineEventHandler((event) => {
  requireHookAuth(event)
  return APP_MANIFEST
})
