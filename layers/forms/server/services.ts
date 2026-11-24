// What other modules may import as #modules/forms (form builder specification, part 4, "Services
// forms offers"). Only a module that lists forms in `requires` may call these; forms is always on,
// so requiring it ties nothing to a switch. Reads take the person the host acts for; writes take the
// caller's unit of work and never commit. The host checks its own abilities on its record first.
export { slotForms, slotDecides, slotFormVersion, slotQuiz, addResponse, recordFieldColumns, recordFieldValues, eraseRecordFields } from './hosting'
export type { SlotForm, FieldColumn, FieldValue } from './hosting'
