// Health: forms whose live version sent a response round its system moves until the chain stopped
// (FB-514, AT3). Publishing a version that breaks the loop clears the warning.
import { all } from '#kit'

export default {
  async check() {
    const looped = await all<{ title: string }>(
      `SELECT DISTINCT f.title FROM core_audit a JOIN forms_responses r ON r.id = a.record_id JOIN forms_forms f ON f.id = r.form_id
       WHERE a.record_type = 'forms.response' AND a.action = 'state' AND json_extract(a.detail, '$.loop') = 1 AND r.version_id = f.live_version_id ORDER BY f.title`)
    if (!looped.length) return { state: 'ok', sentence: 'No form\'s automatic moves have gone round in a loop.' }
    return {
      state: 'warning',
      sentence: `Automatic moves went round in a loop on ${looped.map(f => f.title).join(', ')}, and stopped after five.`,
      remedy: 'Open the form\'s stages and change the conditions so no response can come back to where it started, then publish it again.',
      to: '/console/forms',
    }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string, to?: string }> }
