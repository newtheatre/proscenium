// Words a server builds into a message (a line of an email's details, a calendar file's name) from
// a module's catalogue, so they sit with its other strings rather than in the code. Each module
// imports its own i18n/en-GB.json, which the server bundles; nothing is read from disk at run time.
// The lookup is the app's: `{name}` placeholders, and `.one` / `.other` when a count is given.

export type Words = (key: string, params?: Record<string, string | number>) => string

/** A lookup over one or more catalogues. A missing key answers with the key, as the app does. */
export function wordsFrom(...catalogues: Record<string, string>[]): Words {
  const messages: Record<string, string> = Object.assign({}, ...catalogues)
  return (key, params = {}) => {
    let text = messages[key]
    if (typeof params.count === 'number') text = messages[`${key}.${params.count === 1 ? 'one' : 'other'}`] ?? text
    if (text === undefined) return key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
  }
}
