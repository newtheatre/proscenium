// The form builder (form builder specification): a theatre's own questions anywhere in the platform,
// with logic, versions and, where a form wants one, a workflow. Always on, as the specification
// decides. This file grows with the build; so far the module is its engine (shared/engine), which
// declares nothing.
import { defineModule } from '#kit'

export default defineModule({
  id: 'forms',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: false,
})
