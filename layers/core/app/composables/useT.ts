// Every string a person reads goes through t(). One catalogue per language per module, merged
// here: `<module>.<area>.<name>`. A module's catalogue is i18n/en-GB.json plus any parts in
// i18n/en-GB/, as the conformance check reads it. British English is the source language.
const catalogues = import.meta.glob<Record<string, string>>([
  '../../../*/i18n/en-GB.json',
  '../../../*/i18n/en-GB/*.json',
  '../../../../site/layers/*/i18n/en-GB.json',
  '../../../../site/layers/*/i18n/en-GB/*.json',
  '../../../../tests/fixtures/gallery/gallery/i18n/en-GB.json',
], { eager: true, import: 'default' })

const messages: Record<string, string> = Object.assign({}, ...Object.values(catalogues))

export type Params = Record<string, string | number>

export function translate(key: string, params: Params = {}): string {
  let text = messages[key]
  if (typeof params.count === 'number') text = messages[`${key}.${params.count === 1 ? 'one' : 'other'}`] ?? text
  if (text === undefined) return key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

/** Whether a catalogue has this key, so a server's refusal text can be told from a key. */
export function hasMessage(key: string): boolean {
  return key in messages
}

export function useT() {
  return { t: translate, te: hasMessage }
}
