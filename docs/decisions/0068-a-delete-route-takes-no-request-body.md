# 0068: A DELETE route takes its parameters from the path or the query string, never from a body

- Status: Proposed
- Date: 2026-09-13

## Context

`DELETE /api/admin/roles` took `userId` and `role` in a request body, and
`app/pages/people/accounts/[id].vue` sent them that way. On the Workers runtime, reading that body
does not fail: it never returns. The runtime eventually gives up and answers

```
Uncaught Error: The Workers runtime canceled this request because it detected that your
Worker's code had hung and would never generate a response.
```

and, under `wrangler dev`, takes the whole worker process down with it. Revoking a role was
therefore impossible on the deployed site, and the symptom was a 500 with no stack pointing at
anything in this repository. The same request with no body at all validates and refuses normally,
so it is reading a body on a DELETE that hangs, not the method and not the handler.

This was the only route of its kind: a sweep of all 255 write routes under `server/api` found one
`*.delete.ts` handler reading a body, and one caller sending one. Nothing else in the application
was affected, and the other 254 routes answered sanely under the same runtime. It was found the
same way as 0067, by driving the built worker under `wrangler dev --local`, and for the same
underlying reason: no test suite runs against the Workers runtime, so a defect that only exists
there reaches production unopposed.

## Decision

A route that deletes takes what it needs from the path or the query string. No `*.delete.ts`
handler calls `readBody` or `readValidatedBodyOrThrow`, and no caller passes `body` alongside
`method: 'DELETE'`.

`tests/unit/delete-routes-take-no-body.test.ts` enforces both halves by scanning the source, in the
manner of the admin conventions (0032) and the design language (0021). It is a test rather than a
review habit because the failure it prevents is invisible everywhere except the deployed worker:
the handler looks correct, the types check, every suite passes, and `nuxt dev` serves it happily.

Where a deletion genuinely needs a structured payload, too large or too nested for a query string,
it is a `POST` to a named action (`.../revoke`), not a DELETE with a body.

## Consequences

- Revoking a role works again. The route reads `?userId=...&role=...` and the page sends `query`
  rather than `body`; nothing else about the behaviour, the refusal or the audit entry changes.
- The rule is slightly stricter than the defect requires: a DELETE reading a body is only fatal
  when a body is actually sent. Keeping the rule at the handler as well as the caller means a
  future page cannot reintroduce the hang by adding a body to a call that previously had none.
- A query string is visible in logs and in browser history in a way a body is not. Neither
  parameter here is personal data beyond an account id, which the path of every neighbouring route
  already carries, so this costs nothing today. A deletion whose parameters are sensitive is the
  case for the `POST` to a named action above, not for reopening the body.
- This is the second defect in two days found only by driving the built worker by hand, after
  0067. The gap both came through is recorded in `docs/known-issues.md` and proposed as a story in
  `docs/backlog/`: until something runs against the Workers runtime in CI, this class of defect is
  found by users.

## Options considered

**Keep the body and read it differently**, for instance through `event.node.req` or by reading the
raw stream. Rejected: it is a workaround for a runtime behaviour nobody here controls, it would
have to be understood by every future reader of that one route, and the HTTP semantics are
arguable at best. A DELETE with a body is a thing specifications permit and implementations widely
refuse to define; not relying on it is the smaller commitment.

**Change the route to `POST /api/admin/roles/revoke`.** A fair alternative, and the shape the rule
above names for a payload that genuinely needs one. Rejected here because two scalars fit a query
string comfortably, and `DELETE /api/admin/roles` reads correctly next to the `POST` that grants.
