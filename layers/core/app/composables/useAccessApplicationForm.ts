// The access scheme's application form (ID-38, ID-42): ticks against the theatre's list of needs,
// each with an optional short note when the scheme allows notes, the companions needed, and anything
// else. The person's own form and a reviewer applying on somebody's behalf both build it from here,
// on PageForm's 'ticks' and 'radio' kinds. The API speaks in terms ({ term, note? }); the form's tick
// list holds { value, note? }, so this converts both ways.
import { z } from 'zod'
import type { FormField } from '../components/PageForm.vue'

/** What a person says, as the API sends and takes it. */
export interface AccessApplicationValue {
  needs: { term: string, note?: string }[]
  companions: 0 | 1 | 2
  other?: string
}

const NOTE_LIMIT = 200 // not-policy: the server's bound on a note
const OTHER_LIMIT = 1000 // not-policy: the server's bound on "anything else"

export function useAccessApplicationForm(
  needs: MaybeRefOrGetter<{ id: string, label: string }[]>,
  allowNote: MaybeRefOrGetter<boolean>,
) {
  const { t } = useT()

  const schema = z.object({
    needs: z.array(z.object({ value: z.string(), note: z.string().max(NOTE_LIMIT).optional() })),
    companions: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    other: z.string().max(OTHER_LIMIT).optional(),
  })

  const fields = computed<FormField[]>(() => [
    {
      name: 'needs',
      label: t('core.access.form.needs'),
      kind: 'ticks',
      help: t('core.access.form.needs-help'),
      options: toValue(needs).map(n => ({ value: n.id, label: n.label })),
      ...(toValue(allowNote) ? { notes: { max: NOTE_LIMIT, label: t('core.access.form.note') } } : {}),
    },
    {
      name: 'companions',
      label: t('core.access.form.companions'),
      kind: 'radio',
      help: t('core.access.form.companions-help'),
      options: [0, 1, 2].map(n => ({ value: n, label: t(`core.access.form.companions-${n}`) })),
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
    const offered = new Set(toValue(needs).map(n => n.id))
    return {
      needs: (from?.needs ?? []).filter(n => offered.has(n.term)).map(n => n.note ? { value: n.term, note: n.note } : { value: n.term }),
      companions: from?.companions ?? 0,
      other: from?.other ?? '',
    }
  }

  /** The API's body from the form's values. */
  function toBody(values: Record<string, any>): AccessApplicationValue {
    const ticked = (values.needs ?? []) as { value: string, note?: string }[]
    const other = String(values.other ?? '').trim()
    return {
      needs: ticked.map(n => n.note?.trim() ? { term: n.value, note: n.note.trim() } : { term: n.value }),
      companions: values.companions,
      ...(other ? { other } : {}),
    }
  }

  return { schema, fields, toForm, toBody }
}
