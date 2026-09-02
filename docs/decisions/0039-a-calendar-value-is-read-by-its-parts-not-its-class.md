# 0039: A calendar value is read by its parts, not by its class

- Status: Accepted
- Date: 2026-09-02

## Context

`app/components/DateField.vue` is the single place that converts between the `YYYY-MM-DD` strings
the API speaks and the calendar value the date input takes. It was written to guard the conversion
the obvious way:

```ts
model.value = next instanceof CalendarDate ? next.toString() : undefined
```

Against the development server that line silently discarded every date anybody typed. The
component displayed the date correctly, the segments filled in, and the form then submitted
`undefined` for the field. Zod refused it with "expected string, received undefined" under a field
the user could plainly see was filled in.

### What is actually happening

A probe in the setter, run in the browser against `nuxt dev`, returned:

```
ours      = $2aaf608024c21ca1$export$99faa760c7908e4f
theirs    = $2aaf608024c21ca1$export$99faa760c7908e4f
sameClass = false
protoSame = false
```

The two classes have the **same name and different identity**. That is two module instances of
`@internationalized/date` in one page, so `instanceof` compares against the wrong class object and
is false for a perfectly good value.

Two things are worth writing down because both are misleading on their own:

- **The mangled name proves nothing.** `$2aaf608024c21ca1$export$...` is how `@internationalized/date`
  publishes its own Parcel-built output. Both copies carry it. It is not a fingerprint of a second
  bundler having been involved, and reading it as one sends you looking for the wrong thing.
- **`node_modules` holds exactly one copy.** `reka-ui` declares the library as an ordinary
  dependency rather than vendoring it, so nothing in the dependency tree is duplicated and no
  amount of inspecting it will show the problem.

The duplication is created by Vite's dependency pre-bundling. `node_modules/.cache/vite/client/deps`
holds `@internationalized_date.js`, which is what our own import resolves to, and it holds **no**
`reka-ui` entry, so Reka is served from source and its own `import ... from '@internationalized/date'`
resolves to the raw module instead. One import, two module URLs, two class objects.

### How far it reaches

Development and the browser tests. A production build resolves both importers to one module id:
the built client bundle carries the library in a single chunk. That has been checked by inspecting
the bundle, not by driving a production build in a browser, so treat it as strong evidence rather
than proof.

That distinction does not make the bug cosmetic. The development server is what every screen is
built and demonstrated against, and the end-to-end suite is the gate, so a defect that only appears
there is a defect that hides real regressions. The fellowship roll's browser case had been failing
on exactly this. It was written up in known issues as a cold-cache flake, four causes were
eliminated over several days, and none of them was it.

## Decision

**Never narrow a value from another package with `instanceof`.** Read the parts.

`DateField` converts by reading `year`, `month` and `day` off the value and formatting them,
returning `undefined` only when those are genuinely absent. It behaves identically whichever copy
of the library produced the value, so it is correct in development and in production for the same
reason rather than by luck.

The rule generalises to anything crossing a package boundary where a bundler decides module
identity: a `Date`, an `Error` subclass, a decimal, a temporal value. Inside our own code
`instanceof` is fine, because there is one copy of the class by construction.

## Consequences

A malformed object is no longer distinguishable from a foreign well-formed one, which is the point:
we care what the value *is*, not which module instance minted its constructor.

This class of failure is silent by construction. The rejecting branch looks like sensible defensive
coding, the symptom surfaces two layers away as a validation error about a field that is visibly
filled in, and both of the obvious diagnostics (the constructor's name, the shape of
`node_modules`) point away from the cause. The tell is a validation error naming `undefined` for a
field the screen shows as complete.

The end-to-end helper that fills a date can only verify the rendered segments, because a helper
driving a browser cannot see Vue state, and it duly reported success while the model stayed empty.
So a test of any form carrying a date must assert the row that was saved. Filling a date field is
not evidence that a date was submitted.

That last point generalises well past `instanceof`, and it is the reason this survived as long as
it did. **A date field can display exactly the right answer while holding nothing**, so an
assertion that reads the segments proves less than it appears to: it passes identically with the
defect and without it. The rooms suite carried one such assertion, checking the rendered segments
held eight digits, and it never once exercised the setter, because every rooms case supplies its
date through the query string instead of typing it. A path no test drives is not a path a green
suite vouches for.
