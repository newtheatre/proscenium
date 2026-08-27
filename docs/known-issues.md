# Known issues

Defects and gaps found and not fixed, with where the fix belongs. A problem recorded here is one
somebody chose not to solve yet; a problem nobody wrote down is one the next person rediscovers the
hard way.

Add a row when you find something you are not fixing in the same pull request. Delete it when it is
fixed, in the pull request that fixes it.

## Product

| What | Why it matters | Where it belongs |
| --- | --- | --- |
| **No per-IP rate limiting anywhere.** A-101 criterion 5 (10 registrations an hour per IP) and A-103 criterion 4 (20 sign-in attempts per 15 minutes per IP) are both unmet. Only the per-address halves are enforced. | One address is limited; one attacker with a list of addresses is not limited at all. | A-101, A-103. Needs the client IP, which on Workers is `CF-Connecting-IP`. |
| **`VERIFY_TOKEN_HOURS = 24` is hardcoded** in `server/utils/tokens.ts`, and J-104 criterion 1 says no policy number is. | It is a policy number the committee may want to move, and moving it is a deploy. | It has no key on the workshop register, so it needs one proposing before it can be configuration. |
| **`ADMIN_TOKEN_HOURS` has no consumer.** The key and its default exist; nothing issues a `SET_PASSWORD` token. | Nothing is broken, but the surface lists a setting that changes nothing. | A-116 and A-121, which introduce the paths that issue one. |
| **A Google sign-in still names one account state.** `?refused=linked-elsewhere` says the Google identity is on another account. The disabled state no longer leaks (A-122 criterion 2), but this one does. | It is useful copy for the person and a fact about an account for anyone else. Lower stakes than disabled-ness, which is why it was left. | A-123, which builds the merge that refusal points at. |
| **Personal data is classified per table, not per column.** `shared/utils/personal-data.ts` says what each table holds and what erasure does to it; `docs/data-model.md` promises a per-column scrub classification. | A column added to an already-classified table joins the export and the erasure by default, which is the safe direction, but nothing forces a decision about it. | K-109, if per-column granularity turns out to be needed once a module has free-text columns. |
| **`content/` holds no pages**, so `check:content-tokens` passes over zero tokens. | The check is green by vacuum, and will not have been exercised on real content until J-110. | J-110. |

## Platform

| What | Why it matters | Where it belongs |
| --- | --- | --- |
| **Seven scheduled tasks are stubs.** `holds:release`, `training:expiry-sweep`, `sessions:sweep`, `shifts:remind`, `nights:close`, `backup` and `retention:sweep` are registered, run on their cron and do nothing but name the story they wait for. | A cron that fires and does nothing looks identical to one that fires and works. | Each named story. `backup` (K-108) is the one with no other cover. |
| **`requirePermission` reads `liveGrants` twice** for the same account in one request. | Two D1 round trips where one would do, on every guarded request. | Whenever the authorisation path is next touched. |
| **Nothing alerts on an unhealthy deploy.** `/api/health` returns 503 naming pending migrations and nobody is watching it. | The signal exists and reaches no one. | K-107 criterion 4. |
| **`db.batch` is not a transaction.** Two audit writes (`sign-in.post.ts`, `recovery-codes.post.ts`) insert outside the batch carrying their change, so the entry and the change are not atomic. | An audit entry can exist for a change that failed, or the reverse. | J-101 criterion 1, when the audit coverage fixture is built. |

## Tooling and tests

| What | Why it matters | Where it belongs |
| --- | --- | --- |
| **`Bun.WebView` exposes `click`, `type`, `press` and `cdp`**, and `tests/helpers/webview.ts` reimplements the first two through `evaluate`. | The bespoke versions work and are tested, but they are bespoke: the native ones dispatch trusted events, which ours cannot. | A tidy-up when a test needs something `evaluate` cannot do, such as a real keypress. |
| **One Chrome profile leaks per test run**, about 130MB, from the probe in `skipReason()`. The rest are swept when the app stops. | It filled this machine's `/tmp` with 105 of them before the sweep existed. One a run is survivable; nothing cleans it. | The harness, when the probe can be made to report its directory. |
| **Three integration files are `test.todo` stubs**: `races`, `money`, `erasure`. CI counts them as passing. | K-121 claims a named regression suite that gates from day one, and everything in it but the DST case is empty. | K-121, and the stories that make each case buildable. |
