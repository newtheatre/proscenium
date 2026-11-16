// Installs identity's access provider, so every route's permission check reads real sessions and
// grants. Runs after the kit plugin, which installs the registry.
import { defineNitroPlugin } from 'nitropack/runtime'
import { setAccessProvider } from '#kit/access'
import { identityAccess } from '../identity/access'

export default defineNitroPlugin(() => {
  setAccessProvider(identityAccess)
})
