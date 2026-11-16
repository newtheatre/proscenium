// Installs identity's access provider, so every route's permission check reads real sessions and
// grants. Runs after the kit plugin, which installs the registry. It also loads the Reflect metadata
// API at start-up: passkeys (@simplewebauthn/server, through @peculiar/x509's tsyringe) need it, and
// the Worker has none.
import 'reflect-metadata'
import { defineNitroPlugin } from 'nitropack/runtime'
import { setAccessProvider } from '#kit/access'
import { identityAccess } from '../identity/access'

export default defineNitroPlugin(() => {
  setAccessProvider(identityAccess)
})
