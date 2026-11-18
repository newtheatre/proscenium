// A scheme's application form (MEM-03, MEM-12): the form attached through the membership.application
// slot, answered when joining and kept with the application as a forms response. A scheme that
// approves (MEM-16) is approved by that form's workflow; see listeners/application-decided.ts.
import { refuse, type Actor, type UnitView } from '#kit'
import { addResponse, slotForms } from '#modules/forms'
import { APPLICATION_SLOT, type Scheme } from './schemes'

export interface FormAnswer { formId: string, answers: Record<string, unknown> }

/**
 * Sends the applicant's answers to the scheme's form in the caller's unit and returns the response's
 * id, or null when the scheme has no form. Refuses when the scheme has a form that is not taking
 * answers, or the answers are missing or for another form; the form builder refuses invalid answers.
 */
export async function answerApplication(unit: UnitView, scheme: Scheme, actor: Actor, answer: FormAnswer | null | undefined): Promise<string | null> {
  const { forms } = await slotForms(APPLICATION_SLOT, scheme.id, actor)
  if (!forms.length) {
    if (scheme.needsApproval) refuse('membership.join.not-online', 'This scheme cannot be joined online at the moment.', { status: 409, remedy: 'Contact the theatre to join.' })
    return null
  }
  const form = forms.find(f => f.state === 'open')
  if (!form) refuse('membership.join.form-shut', 'The application form for this scheme is not taking answers at the moment.', { status: 409, remedy: 'Contact the theatre to join.' })
  if (!answer || answer.formId !== form!.formId) refuse('membership.join.form-needed', 'Answer the application form to join.', { status: 422, remedy: 'Fill in the form and send it again.' })
  const sent = await addResponse(unit, { slot: APPLICATION_SLOT, subject: scheme.id, formId: form!.formId, actor, answers: answer!.answers as Parameters<typeof addResponse>[1]['answers'], ...(form!.draft ? { responseId: form!.draft.responseId } : {}) })
  return sent.responseId
}
