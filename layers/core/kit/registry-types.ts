// The types that flow from the generated registry. `bun run generate` writes
// .generated/types/registry.d.ts, which fills KitRegistry in, so a setting key, an ability, an event
// or a job that no module declares is a type error (F-09).
import type { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KitRegistry {}

type Field<K extends string> = KitRegistry extends { [P in K]: infer T } ? T : Record<string, any>

export type SettingsMap = Field<'settings'>
export type AbilitiesMap = Field<'abilities'>
export type EventsMap = Field<'events'>
export type JobsMap = Field<'jobs'>

export type SettingKey = keyof SettingsMap & string
export type SettingValue<K extends SettingKey> = SettingsMap[K] extends { readonly __value?: infer V } ? V : unknown
export type AbilityName = keyof AbilitiesMap & string
export type EventName = keyof EventsMap & string
export type EventPayload<E extends EventName> = EventsMap[E] extends { payload: infer P extends z.ZodType } ? z.input<P> : Record<string, unknown>
export type JobName = keyof JobsMap & string
export type JobPayload<J extends JobName> = JobsMap[J] extends { payload: infer P extends z.ZodType } ? z.input<P> : unknown

// Helpers the generated declaration uses to read each manifest's sections.
export type SettingsOf<M> = M extends { settings: infer S } ? S : Record<never, never>
export type AbilitiesOf<M> = M extends { abilities: infer A } ? A : Record<never, never>
export type EventsOf<M> = M extends { events: { announces: infer E } } ? E : Record<never, never>
export type JobsOf<M> = M extends { jobs: infer J } ? J : Record<never, never>
