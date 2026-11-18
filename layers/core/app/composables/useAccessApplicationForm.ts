// The access scheme's application form (ID-38, ID-42). The person ticks what makes a visit harder,
// each with an optional short note when the scheme allows notes; then, under "More about your visit",
// says whether they use a wheelchair and, if so, whether they stay in it or move to a seat; whether
// they need a companion or carer and, if so, one or two; and anything else. The needs question heads
// the form and a divider follows it (Matt, 2026-11-17). The person's own form and a reviewer
// applying on somebody's behalf both build it from here, on PageForm's 'ticks', 'checkbox', 'radio'
// and 'select' kinds.
//
// The API speaks in terms ({ term, note? }). The wheelchair answer is one of two terms, and the
// companion and "anything else" terms are set by the server from those questions, so none of those
// four is offered as a tick (shared/access-scheme).
import { z } from 'zod'
import type { FormField } from '../components/PageForm.vue'
import { NOT_TICKED, WHEELCHAIR } from '../../shared/access-scheme'

/** What a person says, as the API sends and takes it. */
export interface AccessApplicationValue {
  needs: { term: string, note?: string }[]
  companions: 0 | 1 | 2
  other?: string
  /** The person's answer to a reviewer's question, sent with the application when they answer. */
  answer?: string
}

/** A need the form can offer: the term's id, its key (slug), label and description. */
export interface AccessNeedOption { id: string, key: string, label: string, description?: string | null }

type Preference = 'stays' | 'transfers'

const NOTE_LIMIT = 200 // not-policy: the server's bound on a note
const OTHER_LIMIT = 1000 // not-policy: the server's bound on "anything else"

export function useAccessApplicationForm(
  needs: MaybeRefOrGetter<AccessNeedOption[]>,
  allowNote: MaybeRefOrGetter<boolean>,
  /** True while the form also answers a reviewer's question: an answer box comes first. */
  answering: MaybeRefOrGetter<boolean> = false,
) {
  const { t } = useT()

  const ticks = computed(() => toValue(needs).filter(n => !NOT_TICKED.includes(n.key)))
  const chair = computed(() => ({
    stays: toValue(needs).find(n => n.key === WHEELCHAIR.stays),
    transfers: toValue(needs).find(n => n.key === WHEELCHAIR.transfers),
  }))
  /** Whether "I use a wheelchair" is asked at all, and whether the follow-up has two answers. */
  const askChair = computed(() => !!(chair.value.stays || chair.value.transfers))
  const askPreference = computed(() => !!(chair.value.stays && chair.value.transfers))

  const schema = z.object({
    needs: z.array(z.object({ value: z.string(), note: z.string().max(NOTE_LIMIT).optional() })),
    wheelchair: z.boolean().optional(),
    preference: z.enum(['stays', 'transfers']).optional(),
    companion: z.boolean().optional(),
    companions: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    other: z.string().max(OTHER_LIMIT).optional(),
    answer: z.string().max(OTHER_LIMIT).optional(),
  }).superRefine((v, ctx) => {
    if (v.wheelchair && askPreference.value && !v.preference)
      ctx.addIssue({ code: 'custom', path: ['preference'], message: t('core.access.form.preference-needed') })
  })

  const fields = computed<FormField[]>(() => [
    ...(toValue(answering)
      ? [{ name: 'answer', label: t('core.access.answer.label'), kind: 'textarea' } satisfies FormField]
      : []),
    {
      name: 'needs',
      label: t('core.access.form.needs'),
      kind: 'ticks',
      heading: true,
      help: t('core.access.form.needs-help'),
      options: ticks.value.map(n => ({ value: n.id, label: n.label, ...(n.description ? { description: n.description } : {}) })),
      ...(toValue(allowNote) ? { notes: { max: NOTE_LIMIT, label: t('core.access.form.note') } } : {}),
    },
    ...(askChair.value
      ? [{
        name: 'wheelchair',
        label: t('core.access.form.wheelchair'),
        kind: 'checkbox',
        section: t('core.access.form.more'),
      } satisfies FormField]
      : []),
    ...(askPreference.value
      ? [{
        name: 'preference',
        label: t('core.access.form.preference'),
        kind: 'radio',
        options: (['stays', 'transfers'] as const).map(p => ({
          value: p,
          label: t(`core.access.form.preference-${p}`),
          description: t(`core.access.form.preference-${p}-help`),
        })),
        showIf: (values: Record<string, any>) => !!values.wheelchair,
      } satisfies FormField]
      : []),
    {
      name: 'companion',
      label: t('core.access.form.companion'),
      kind: 'checkbox',
      help: t('core.access.form.companions-help'),
      // Without the wheelchair question, this one opens the second part.
      ...(askChair.value ? {} : { section: t('core.access.form.more') }),
    },
    {
      name: 'companions',
      label: t('core.access.form.companions-how-many'),
      kind: 'select',
      options: [1, 2].map(n => ({ value: n, label: t(`core.access.form.companions-${n}`) })),
      showIf: (values: Record<string, any>) => !!values.companion,
    },
    {
      name: 'other',
      label: t('core.access.form.other'),
      kind: 'textarea',
      optional: true,
      help: t('core.access.form.other-help'),
    },
  ])

  /** The form's starting values from what was sent before; a need no longer offered is left out. */
  function toForm(from: AccessApplicationValue | null | undefined): Record<string, unknown> {
    const offered = new Set(ticks.value.map(n => n.id))
    const sent = from?.needs ?? []
    const preference: Preference | undefined = sent.some(n => n.term === chair.value.stays?.id)
      ? 'stays'
      : sent.some(n => n.term === chair.value.transfers?.id) ? 'transfers' : undefined
    return {
      needs: sent.filter(n => offered.has(n.term)).map(n => n.note ? { value: n.term, note: n.note } : { value: n.term }),
      wheelchair: !!preference,
      preference,
      companion: !!from?.companions,
      companions: from?.companions || 1,
      other: from?.other ?? '',
    }
  }

  /** The API's body from the form's values. */
  function toBody(values: Record<string, any>): AccessApplicationValue {
    const ticked = (values.needs ?? []) as { value: string, note?: string }[]
    const other = String(values.other ?? '').trim()
    const answer = String(values.answer ?? '').trim()
    // With only one of the two wheelchair entries on the list, ticking the box means that one.
    const preference: Preference | undefined = values.wheelchair
      ? (askPreference.value ? values.preference : chair.value.stays ? 'stays' : 'transfers')
      : undefined
    const chairTerm = preference ? chair.value[preference]?.id : undefined
    return {
      needs: [
        ...ticked.map(n => n.note?.trim() ? { term: n.value, note: n.note.trim() } : { term: n.value }),
        ...(chairTerm ? [{ term: chairTerm }] : []),
      ],
      companions: values.companion ? values.companions : 0,
      ...(other ? { other } : {}),
      ...(answer ? { answer } : {}),
    }
  }

  return { schema, fields, toForm, toBody }
}
