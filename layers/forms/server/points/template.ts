// Contract for forms.template: a ready-made form a module ships (form builder specification, part 4;
// the second half of FB-510), such as a nomination for an award. It is offered in New form beside
// the templates forms ships and the theatre's own, while its module is switched on, and first where
// a form is being started for a slot it suits. A form made from one is a copy and owes it nothing.
//
// A contributor writes the definition as data in the definition format (a module that only `uses`
// forms cannot import its types), and is held to the same checks as the shipped templates: the
// format, and a problems list with no error (FB-208). One that fails them is not offered.
export type { ContributedTemplate as FormsTemplate } from '../../shared/templates'
