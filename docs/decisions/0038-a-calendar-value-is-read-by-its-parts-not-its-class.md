# 0038: A calendar value is read by its parts, not by its class

- Status: Accepted
- Date: 2026-09-02

## Context

`app/components/DateField.vue` is the single place that converts between the `YYYY-MM-DD` strings
the API speaks and the calendar value the date input takes. It was written to guard the conversion
the obvious way:

```ts
model.value = next instanceof CalendarDate ? next.toString() : undefined
```

That line silently discarded every date anybody typed. The component displayed the date correctly,
the segments filled in, and the form then submitted `undefined` for the field. Zod refused it with
"expected string, received undefined" under a field the user could plainly see was filled in.

The cause is that there are two copies of `@internationalized/date` in the running bundle. Reka UI
ships a Parcel-built one, so the value arriving at the setter has a scope-hoisted constructor name
(`$2aaf608024c21ca1$export$99faa760c7908e4f`) rather than `CalendarDate`. It is a real calendar
date with the right year, month and day, and `String()` on it returns `2026-09-23`. It is simply
not an instance of *our* `CalendarDate`, because that is a different class object in a different
module instance. `instanceof` compares identity of the constructor, and identity is what a second
copy of a library destroys.

`node_modules` holds one `@internationalized/date`, so the duplicate is invisible to `bun pm ls`
and to a search of the dependency tree. It exists only in the built bundle.

This was live on four screens: closures, the audit filters, the fellowship roll and training
sessions. The fellowship end-to-end case that records an award had been failing against it, and
was written up in known issues as a cold-cache flake. It was not flaky and it was not the cache.

## Decision

**Never narrow a value from another package's bundle with `instanceof`.** Read the parts.

`DateField` now converts by reading `year`, `month` and `day` off the value and formatting them,
returning `undefined` only when those are genuinely absent. It behaves the same for a value from
either copy of the library, and it will keep behaving the same if a future version of Reka UI
switches build tooling again.

The same rule applies to anything else crossing a package boundary: a `Date`, an `Error`
subclass, a decimal, a temporal value. Inside our own code `instanceof` is fine, because there is
one copy of the class by construction.

## Consequences

A malformed object is no longer distinguishable from a foreign well-formed one, which is the point:
we care what the value *is*, not where its constructor came from. The type parameter on the model
stays, so the compiler still checks our side of the conversion.

Duplicate-copy failures of this shape are silent by nature: the fallback branch looks like sensible
defensive coding, and the symptom surfaces two layers away as a validation error about a field that
is visibly filled in. The tell is a validation error naming `undefined` for a field the screen
shows as complete.

The end-to-end helper that fills a date can only verify the rendered segments, because a helper
driving a browser cannot see Vue state. It therefore reported success while the model stayed
empty. So a test of any form carrying a date must assert the row that was saved, never that the
field looked filled in: filling a date field is not evidence that a date was submitted.
